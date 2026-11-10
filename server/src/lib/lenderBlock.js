// The loan officer details printed on an agent's marketing (flyer, buyer page).
//
// They are copied from the pre-approval letter the loan officer issued, never typed in by
// the agent, so the name and license numbers shown to the public are the real ones.

const s = (v, n = 160) => String(v == null ? '' : v).slice(0, n);

export function lenderFromAssignment(a) {
  if (!a) return null;
  const letter = a.letter && typeof a.letter === 'object' ? a.letter : {};
  const officer = letter.officer && typeof letter.officer === 'object' ? letter.officer : {};
  const lender = letter.lender && typeof letter.lender === 'object' ? letter.lender : {};
  const block = {
    officerName: s(officer.name || a.ownerName),
    officerTitle: s(officer.title),
    officerNmls: s(officer.nmls, 40),
    company: s(lender.name),
    companyNmls: s(lender.nmls, 40),
    phone: s(lender.phone || officer.phone, 40),
    email: s(officer.email || lender.email),
    website: s(lender.website),
  };
  return block.officerName || block.company ? block : null;
}
