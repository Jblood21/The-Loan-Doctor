// MISMO 3.4 (ULAD) importer.
//
// Lets a loan officer drop in a MISMO 3.4 XML file exported from Arive (or any
// LOS) and pull the borrower, property, and loan terms into a pre-approval —
// no Zapier feed required. Dependency-free so it runs identically in the browser
// and in unit tests: a tiny tolerant XML parser + a namespace-agnostic extractor
// that looks up elements by local name wherever they sit in the (deeply nested,
// vendor-variable) MISMO tree.

import type { LoanTerm, LoanType, Scenario, TransactionType } from '@/types';

// ---------------------------------------------------------------------------
// Minimal XML parser → tree
// ---------------------------------------------------------------------------

export interface XmlNode {
  /** Original tag name, including any namespace prefix. */
  name: string;
  /** Lowercased local name (prefix stripped) for matching. */
  local: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content. */
  text: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&amp;/g, '&'); // ampersand last so it doesn't double-decode
}

/** Parse an XML string into a lightweight tree. Returns null if there's no markup. */
export function parseXml(xml: string): XmlNode | null {
  if (typeof xml !== 'string' || xml.indexOf('<') === -1) return null;
  const root: XmlNode = { name: '#root', local: '#root', attrs: {}, children: [], text: '' };
  const stack: XmlNode[] = [root];
  const n = xml.length;
  let i = 0;

  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) break;
    if (lt > i) {
      const txt = decodeEntities(xml.slice(i, lt)).trim();
      if (txt) stack[stack.length - 1].text += (stack[stack.length - 1].text ? ' ' : '') + txt;
    }
    // Skip comments / CDATA / declarations / processing instructions.
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      stack[stack.length - 1].text += xml.slice(lt + 9, end === -1 ? n : end);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt) || xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }
    const gt = xml.indexOf('>', lt + 1);
    if (gt === -1) break;
    let tag = xml.slice(lt + 1, gt).trim();
    i = gt + 1;

    if (tag.startsWith('/')) {
      const cname = tag.slice(1).trim().toLowerCase();
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].name.toLowerCase() === cname) {
          stack.length = s;
          break;
        }
      }
      continue;
    }

    const selfClose = tag.endsWith('/');
    if (selfClose) tag = tag.slice(0, -1).trim();
    const sp = tag.search(/\s/);
    const name = sp === -1 ? tag : tag.slice(0, sp);
    const attrs: Record<string, string> = {};
    if (sp !== -1) {
      const re = /([\w:.-]+)\s*=\s*"([^"]*)"|([\w:.-]+)\s*=\s*'([^']*)'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(tag.slice(sp + 1)))) attrs[m[1] || m[3]] = decodeEntities(m[2] ?? m[4] ?? '');
    }
    const local = (name.includes(':') ? name.slice(name.indexOf(':') + 1) : name).toLowerCase();
    const node: XmlNode = { name, local, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root.children.length ? root : null;
}

// ---- tree helpers (all match by local name, case-insensitive) --------------

function* walk(node: XmlNode): Generator<XmlNode> {
  for (const c of node.children) {
    yield c;
    yield* walk(c);
  }
}
function findAll(node: XmlNode, local: string): XmlNode[] {
  const t = local.toLowerCase();
  const out: XmlNode[] = [];
  for (const d of walk(node)) if (d.local === t) out.push(d);
  return out;
}
function findFirst(node: XmlNode, local: string): XmlNode | null {
  const t = local.toLowerCase();
  for (const d of walk(node)) if (d.local === t) return d;
  return null;
}
/** First non-empty text among the given local names (searched in order). */
function firstText(node: XmlNode, ...locals: string[]): string {
  for (const l of locals) {
    const f = findFirst(node, l);
    if (f && f.text.trim()) return f.text.trim();
  }
  return '';
}
/** Case-insensitive attribute lookup. */
function attr(node: XmlNode, key: string): string {
  const k = key.toLowerCase();
  for (const [kk, vv] of Object.entries(node.attrs)) if (kk.toLowerCase() === k) return vv;
  return '';
}
function num(s: string): number {
  const v = parseFloat(String(s).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(v) ? v : 0;
}

// ---------------------------------------------------------------------------
// MISMO extraction
// ---------------------------------------------------------------------------

export interface MismoResult {
  scenario: Scenario;
  borrowerName: string;
  propertyAddress: string;
  loanNumber: string;
  /** One-line human summary of what was imported. */
  summary: string;
}

const TERM_OPTIONS: LoanTerm[] = ['30', '20', '15', '10'];
const nearestTerm = (years: number): LoanTerm =>
  TERM_OPTIONS.reduce((a, b) => (Math.abs(+b - years) < Math.abs(+a - years) ? b : a), '30');

/** Collapse two same-last-name borrowers to "John & Jane Smith". */
function joinBorrowers(names: string[]): string {
  if (names.length === 2) {
    const [a, b] = names.map((x) => x.split(/\s+/));
    if (a.length >= 2 && b.length >= 2 && a[a.length - 1] === b[b.length - 1]) {
      return `${a.slice(0, -1).join(' ')} & ${b.join(' ')}`;
    }
  }
  return names.join(' & ');
}

/**
 * Parse a MISMO 3.4 XML document into a ready-to-use pre-approval import.
 * Returns null if the file isn't parseable or has neither a borrower nor a loan
 * amount (i.e. it's not a usable loan file).
 */
export function parseMismo(xml: string): MismoResult | null {
  const root = parseXml(xml);
  if (!root) return null;

  // --- Borrowers: parties whose role is "Borrower" ---
  const names: string[] = [];
  for (const p of findAll(root, 'PARTY')) {
    const isBorrower = findAll(p, 'PartyRoleType').some((r) => r.text.trim().toLowerCase() === 'borrower');
    if (!isBorrower) continue;
    const nm = findFirst(p, 'NAME');
    if (!nm) continue;
    const full = [firstText(nm, 'FirstName'), firstText(nm, 'MiddleName'), firstText(nm, 'LastName')]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (full) names.push(full);
  }
  const uniqueNames = [...new Set(names)].slice(0, 2);
  const borrowerName = joinBorrowers(uniqueNames);

  // --- Subject property address ---
  const subj = findFirst(root, 'SUBJECT_PROPERTY') || root;
  const addrNode = findFirst(subj, 'ADDRESS') || findFirst(root, 'ADDRESS');
  let propertyAddress = '';
  if (addrNode) {
    const line = firstText(addrNode, 'AddressLineText', 'AddressLineOneText');
    const city = firstText(addrNode, 'CityName');
    const state = firstText(addrNode, 'StateCode', 'StateName');
    const zip = firstText(addrNode, 'PostalCode');
    const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    propertyAddress = [line, cityStateZip].filter(Boolean).join(', ');
  }

  // --- Subject loan (attribute LoanRoleType="SubjectLoan", else element, else first) ---
  const loans = findAll(root, 'LOAN');
  const isSubject = (l: XmlNode) => {
    const a = attr(l, 'LoanRoleType').toLowerCase();
    if (a) return a === 'subjectloan';
    return firstText(l, 'LoanRoleType').toLowerCase() === 'subjectloan';
  };
  const loan = loans.find(isSubject) || loans[0] || root;

  const loanAmount = num(firstText(loan, 'BaseLoanAmount', 'NoteAmount', 'TotalLoanAmount', 'LoanAmount')) || num(firstText(root, 'BaseLoanAmount', 'NoteAmount'));
  const noteRate = num(firstText(loan, 'NoteRatePercent', 'RequestedInterestRatePercent')) || num(firstText(root, 'NoteRatePercent'));
  const termMonths = num(firstText(loan, 'LoanMaturityPeriodCount')) || num(firstText(root, 'LoanMaturityPeriodCount'));
  const purpose = (firstText(loan, 'LoanPurposeType') || firstText(root, 'LoanPurposeType')).toLowerCase();
  const mortgageType = (firstText(loan, 'MortgageType') || firstText(root, 'MortgageType')).toLowerCase();
  const amortType = (firstText(loan, 'AmortizationType') || firstText(root, 'AmortizationType')).toLowerCase();
  const salesPrice = num(firstText(root, 'SalesContractAmount'));
  const propValue = num(firstText(root, 'PropertyValuationAmount', 'PropertyEstimatedValueAmount', 'BasePropertyAppraisedValueAmount', 'PropertyAppraisedValueAmount'));
  const creditScore = num(firstText(root, 'CreditScoreValue', 'TotalCreditScoreValue'));
  const loanNumber = firstText(root, 'LoanIdentifier', 'LenderLoanIdentifier', 'UniversalLoanIdentifier', 'AgencyCaseIdentifier');

  // Not a usable loan file.
  if (!borrowerName && !loanAmount) return null;

  const transaction: TransactionType = purpose.includes('refinance') ? 'refinance' : 'purchase';
  let loanType: LoanType = 'conventional';
  if (mortgageType.includes('fha')) loanType = 'fha';
  else if (mortgageType.includes('va')) loanType = 'va';
  else if (mortgageType.includes('usda') || mortgageType.includes('ruraldevelopment') || mortgageType.includes('rhs')) loanType = 'usda';
  if (loanType === 'conventional' && amortType.includes('adjustable')) loanType = 'arm';

  const term = nearestTerm(termMonths ? termMonths / 12 : 30);
  const price = transaction === 'purchase' ? salesPrice || propValue || loanAmount : propValue || salesPrice || loanAmount;
  const homePrice = Math.max(price, loanAmount);
  const downPayment = Math.max(0, homePrice - loanAmount);
  const downPct = homePrice > 0 ? Math.round((downPayment / homePrice) * 10000) / 100 : 0;

  const bands = [800, 760, 740, 700, 660, 620, 580];
  const credit = creditScore ? String(bands.find((b) => creditScore >= b) ?? 580) : '740';
  const borrowers: '1' | '2' = uniqueNames.length >= 2 ? '2' : '1';

  const scenario: Scenario = {
    name: 'Imported loan',
    transaction,
    borrowers,
    loanType,
    program: 'standard',
    homePrice,
    downPayment,
    downPct,
    rate: noteRate,
    term,
    credit,
    lenderCredit: 0,
    sellerCredit: 0,
    otherCredits: 0,
  };

  const summary = [
    borrowerName || 'Borrower',
    loanAmount ? `$${Math.round(loanAmount).toLocaleString('en-US')}` : '',
    `${term}yr ${loanType.toUpperCase()}`,
    transaction === 'refinance' ? 'refinance' : 'purchase',
  ]
    .filter(Boolean)
    .join(' · ');

  return { scenario, borrowerName, propertyAddress, loanNumber, summary };
}
