import libphonenumber from 'google-libphonenumber';
import { ok, type Provider } from '../_registry.js';

export interface PhoneValidationInput {
  number: string;
  country?: string;
}

export interface PhoneValidationOutput {
  valid: boolean;
  possible: boolean;
  e164: string | null;
  international: string | null;
  national: string | null;
  country: string | null;
  numberType: string;
}

const phoneUtil = libphonenumber.PhoneNumberUtil.getInstance();
const { PhoneNumberFormat, PhoneNumberType } = libphonenumber;

const typeNames = new Map<number, string>([
  [PhoneNumberType.FIXED_LINE, 'fixed-line'],
  [PhoneNumberType.MOBILE, 'mobile'],
  [PhoneNumberType.FIXED_LINE_OR_MOBILE, 'fixed-line-or-mobile'],
  [PhoneNumberType.TOLL_FREE, 'toll-free'],
  [PhoneNumberType.PREMIUM_RATE, 'premium-rate'],
  [PhoneNumberType.SHARED_COST, 'shared-cost'],
  [PhoneNumberType.VOIP, 'voip'],
  [PhoneNumberType.PERSONAL_NUMBER, 'personal-number'],
  [PhoneNumberType.PAGER, 'pager'],
  [PhoneNumberType.UAN, 'uan'],
  [PhoneNumberType.VOICEMAIL, 'voicemail'],
  [PhoneNumberType.UNKNOWN, 'unknown'],
]);

function invalid(): PhoneValidationOutput {
  return {
    valid: false,
    possible: false,
    e164: null,
    international: null,
    national: null,
    country: null,
    numberType: 'unknown',
  };
}

export const phoneValidationProvider: Provider<PhoneValidationInput, PhoneValidationOutput> = {
  id: 'phone.validate-offline',
  storagePolicy: 'none',
  source: {
    name: 'Google libphonenumber metadata via google-libphonenumber',
    url: 'https://github.com/google/libphonenumber',
    license: 'Apache-2.0 (wrapper MIT AND Apache-2.0)',
    notes: 'Validates numbering-plan format only; it does not prove assignment or reachability.',
  },
  async execute({ number, country }) {
    try {
      const parsed = phoneUtil.parse(number, country?.toUpperCase());
      const valid = phoneUtil.isValidNumber(parsed);
      const possible = phoneUtil.isPossibleNumber(parsed);
      return ok({
        valid,
        possible,
        e164: phoneUtil.format(parsed, PhoneNumberFormat.E164),
        international: phoneUtil.format(parsed, PhoneNumberFormat.INTERNATIONAL),
        national: phoneUtil.format(parsed, PhoneNumberFormat.NATIONAL),
        country: phoneUtil.getRegionCodeForNumber(parsed) ?? null,
        numberType: typeNames.get(phoneUtil.getNumberType(parsed)) ?? 'unknown',
      });
    } catch {
      return ok(invalid());
    }
  },
};
