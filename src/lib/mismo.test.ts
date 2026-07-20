import { describe, it, expect } from 'vitest';
import { parseMismo, parseXml } from './mismo';

// Compact but realistic MISMO 3.4 (ULAD) sample: namespaced, two borrowers plus a
// non-borrower party, subject property, and a subject loan with terms.
const SAMPLE = `<?xml version="1.0" encoding="utf-8"?>
<MESSAGE xmlns="http://www.mismo.org/residential/2009/schemas" MISMOReferenceModelIdentifier="3.4.0">
  <DEAL_SETS><DEAL_SET><DEALS><DEAL>
    <COLLATERALS><COLLATERAL><SUBJECT_PROPERTY>
      <ADDRESS>
        <AddressLineText>123 Main Street</AddressLineText>
        <CityName>Austin</CityName>
        <StateCode>TX</StateCode>
        <PostalCode>78702</PostalCode>
      </ADDRESS>
      <PROPERTY_VALUATIONS><PROPERTY_VALUATION><PROPERTY_VALUATION_DETAIL>
        <PropertyValuationAmount>460000</PropertyValuationAmount>
      </PROPERTY_VALUATION_DETAIL></PROPERTY_VALUATION></PROPERTY_VALUATIONS>
    </SUBJECT_PROPERTY></COLLATERAL></COLLATERALS>
    <LOANS><LOAN LoanRoleType="SubjectLoan">
      <LOAN_IDENTIFIERS><LOAN_IDENTIFIER><LoanIdentifier>LN-20471</LoanIdentifier></LOAN_IDENTIFIER></LOAN_IDENTIFIERS>
      <TERMS_OF_LOAN>
        <BaseLoanAmount>400000</BaseLoanAmount>
        <NoteRatePercent>6.5</NoteRatePercent>
        <LoanPurposeType>Purchase</LoanPurposeType>
        <MortgageType>FHA</MortgageType>
      </TERMS_OF_LOAN>
      <MATURITY><MATURITY_RULE><LoanMaturityPeriodCount>360</LoanMaturityPeriodCount></MATURITY_RULE></MATURITY>
      <AMORTIZATION><AMORTIZATION_RULE><AmortizationType>Fixed</AmortizationType></AMORTIZATION_RULE></AMORTIZATION>
    </LOAN></LOANS>
    <SALES_CONTRACTS><SALES_CONTRACT><SALES_CONTRACT_DETAIL>
      <SalesContractAmount>450000</SalesContractAmount>
    </SALES_CONTRACT_DETAIL></SALES_CONTRACT></SALES_CONTRACTS>
    <PARTIES>
      <PARTY><INDIVIDUAL><NAME><FirstName>John</FirstName><LastName>Smith</LastName></NAME></INDIVIDUAL>
        <ROLES><ROLE><ROLE_DETAIL><PartyRoleType>Borrower</PartyRoleType></ROLE_DETAIL></ROLE></ROLES></PARTY>
      <PARTY><INDIVIDUAL><NAME><FirstName>Jane</FirstName><LastName>Smith</LastName></NAME></INDIVIDUAL>
        <ROLES><ROLE><ROLE_DETAIL><PartyRoleType>Borrower</PartyRoleType></ROLE_DETAIL></ROLE></ROLES></PARTY>
      <PARTY><INDIVIDUAL><NAME><FirstName>Alan</FirstName><LastName>Blood</LastName></NAME></INDIVIDUAL>
        <ROLES><ROLE><ROLE_DETAIL><PartyRoleType>LoanOriginator</PartyRoleType></ROLE_DETAIL></ROLE></ROLES></PARTY>
    </PARTIES>
  </DEAL></DEALS></DEAL_SET></DEAL_SETS>
</MESSAGE>`;

describe('parseXml', () => {
  it('parses namespaced tags and nested text', () => {
    const root = parseXml(SAMPLE);
    expect(root).not.toBeNull();
  });
  it('returns null for non-XML', () => {
    expect(parseXml('just text')).toBeNull();
    expect(parseXml('')).toBeNull();
  });
});

describe('parseMismo', () => {
  const r = parseMismo(SAMPLE)!;

  it('extracts and compacts the borrower names', () => {
    expect(r.borrowerName).toBe('John & Jane Smith'); // same last name → merged
  });
  it('excludes non-borrower parties (loan officer)', () => {
    expect(r.borrowerName).not.toContain('Alan');
    expect(r.scenario.borrowers).toBe('2');
  });
  it('builds a clean subject property address', () => {
    expect(r.propertyAddress).toBe('123 Main Street, Austin, TX 78702');
  });
  it('maps the loan program, purpose, rate, and term', () => {
    expect(r.scenario.loanType).toBe('fha');
    expect(r.scenario.transaction).toBe('purchase');
    expect(r.scenario.rate).toBe(6.5);
    expect(r.scenario.term).toBe('30');
  });
  it('uses the sales price and derives the down payment', () => {
    expect(r.scenario.homePrice).toBe(450000); // sales contract wins for a purchase
    expect(r.scenario.downPayment).toBe(50000); // 450k − 400k base loan
  });
  it('captures the loan number', () => {
    expect(r.loanNumber).toBe('LN-20471');
  });

  it('handles a VA adjustable-rate refinance', () => {
    const va = SAMPLE.replace('Purchase', 'Refinance').replace('FHA', 'VA').replace('Fixed', 'AdjustableRate');
    const rr = parseMismo(va)!;
    expect(rr.scenario.transaction).toBe('refinance');
    expect(rr.scenario.loanType).toBe('va'); // VA wins over the adjustable→arm mapping
    expect(rr.scenario.homePrice).toBe(460000); // refi uses appraised value
  });

  it('returns null when there is no borrower or loan amount', () => {
    expect(parseMismo('<MESSAGE><DEAL></DEAL></MESSAGE>')).toBeNull();
    expect(parseMismo('not xml at all')).toBeNull();
  });
});
