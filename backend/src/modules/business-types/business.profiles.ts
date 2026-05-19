import { BusinessType, InventoryModel, ModuleKey, PricingMode, TaxMode, UnitDimension } from '@prisma/client';

interface UnitSeed {
  name: string; abbreviation: string; dimension: UnitDimension;
  conversionFactor: number; baseUnit?: string; isDefault: boolean; showInPos: boolean; showOnPO: boolean;
}

interface ModuleSeed { key: ModuleKey; required: boolean; }

export interface BusinessProfile {
  type: BusinessType;
  label: string;
  group: string;
  description: string;
  inventoryModel: InventoryModel;
  pricingMode: PricingMode;
  taxMode: TaxMode;
  units: UnitSeed[];
  modules: ModuleSeed[];
}

const PROFILES: Record<BusinessType, BusinessProfile> = {
  RETAIL_STORE: {
    type: 'RETAIL_STORE', label: 'Retail Store', group: 'A — Retail & Commerce',
    description: 'General merchandise, clothing, electronics, hardware, gifts, books, toys, and specialty retail.',
    inventoryModel: 'SKU_VARIANT', pricingMode: 'FIXED', taxMode: 'STANDARD_VAT',
    units: [
      { name: 'Each', abbreviation: 'ea', dimension: 'COUNT', conversionFactor: 1, isDefault: true, showInPos: true, showOnPO: true },
      { name: 'Pack', abbreviation: 'pk', dimension: 'COUNT', conversionFactor: 6, isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Box',  abbreviation: 'bx', dimension: 'COUNT', conversionFactor: 12, isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Kilogram', abbreviation: 'kg', dimension: 'WEIGHT', conversionFactor: 1, isDefault: true, showInPos: false, showOnPO: true },
      { name: 'Litre', abbreviation: 'L', dimension: 'VOLUME', conversionFactor: 1, isDefault: true, showInPos: false, showOnPO: true },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'CRM', required: false }, { key: 'LOYALTY', required: false },
      { key: 'BARCODE', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  WHOLESALE_B2B: {
    type: 'WHOLESALE_B2B', label: 'Wholesale / B2B', group: 'A — Retail & Commerce',
    description: 'Distributors, importers, and trade suppliers selling in bulk to businesses.',
    inventoryModel: 'SKU_VARIANT', pricingMode: 'TIERED_BULK', taxMode: 'B2B_ZERO_RATED',
    units: [
      { name: 'Pallet', abbreviation: 'plt', dimension: 'COUNT', conversionFactor: 40, isDefault: true, showInPos: true, showOnPO: true },
      { name: 'Case',   abbreviation: 'cs',  dimension: 'COUNT', conversionFactor: 24, isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Each',   abbreviation: 'ea',  dimension: 'COUNT', conversionFactor: 1,  isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Kilogram', abbreviation: 'kg', dimension: 'WEIGHT', conversionFactor: 1, isDefault: true, showInPos: false, showOnPO: true },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'B2B_ORDERS', required: true }, { key: 'CREDIT_ACCOUNTS', required: false },
      { key: 'REPORTING', required: true },
    ],
  },
  GROCERY_SUPERMARKET: {
    type: 'GROCERY_SUPERMARKET', label: 'Grocery / Supermarket', group: 'A — Retail & Commerce',
    description: 'Food retail including fresh produce, packaged goods, dairy, bakery, and household essentials.',
    inventoryModel: 'SKU_VARIANT', pricingMode: 'WEIGHT_BASED', taxMode: 'MIXED_FOOD_NON',
    units: [
      { name: 'Kilogram', abbreviation: 'kg', dimension: 'WEIGHT', conversionFactor: 1,     isDefault: true,  showInPos: true, showOnPO: true },
      { name: 'Gram',     abbreviation: 'g',  dimension: 'WEIGHT', conversionFactor: 0.001, isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Litre',    abbreviation: 'L',  dimension: 'VOLUME', conversionFactor: 1,     isDefault: true,  showInPos: true, showOnPO: true },
      { name: 'Millilitre', abbreviation: 'ml', dimension: 'VOLUME', conversionFactor: 0.001, isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Each',     abbreviation: 'ea', dimension: 'COUNT', conversionFactor: 1,      isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Bunch',    abbreviation: 'bch', dimension: 'COUNT', conversionFactor: 1,     isDefault: false, showInPos: true, showOnPO: false },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'SCALES_INTEGRATION', required: false }, { key: 'EXPIRY_TRACKING', required: false },
      { key: 'BARCODE', required: false }, { key: 'LOYALTY', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  PHARMACY_CHEMIST: {
    type: 'PHARMACY_CHEMIST', label: 'Pharmacy / Chemist', group: 'A — Retail & Commerce',
    description: 'Prescription and OTC medicines, health supplements, medical consumables, and health devices.',
    inventoryModel: 'BATCH_LOT', pricingMode: 'FIXED', taxMode: 'EXEMPT_REDUCED',
    units: [
      { name: 'Tablet(s)',  abbreviation: 'tab', dimension: 'COUNT', conversionFactor: 1,        isDefault: true,  showInPos: true, showOnPO: true },
      { name: 'Capsule(s)', abbreviation: 'cap', dimension: 'COUNT', conversionFactor: 1,        isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Milligram',  abbreviation: 'mg',  dimension: 'WEIGHT', conversionFactor: 0.000001, isDefault: true, showInPos: true, showOnPO: true },
      { name: 'Millilitre', abbreviation: 'ml',  dimension: 'VOLUME', conversionFactor: 0.001,   isDefault: true,  showInPos: true, showOnPO: true },
      { name: 'Vial',       abbreviation: 'vl',  dimension: 'COUNT', conversionFactor: 1,        isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Strip',      abbreviation: 'str', dimension: 'COUNT', conversionFactor: 10,       isDefault: false, showInPos: true, showOnPO: true },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'BATCH_TRACKING', required: true }, { key: 'EXPIRY_TRACKING', required: true },
      { key: 'RX_MANAGEMENT', required: false }, { key: 'PATIENT_RECORDS', required: false },
      { key: 'INSURANCE_CLAIMS', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  RESTAURANT: {
    type: 'RESTAURANT', label: 'Restaurant / Full-Service Dining', group: 'B — Food & Beverage',
    description: 'Sit-down restaurants, fine dining, family restaurants, and cafeterias with table service.',
    inventoryModel: 'RECIPE_INGREDIENT', pricingMode: 'MENU_BASED', taxMode: 'FAB_SERVICE_RATE',
    units: [
      { name: 'Portion', abbreviation: 'ptn', dimension: 'COUNT', conversionFactor: 1,     isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Gram',    abbreviation: 'g',   dimension: 'WEIGHT', conversionFactor: 0.001, isDefault: true, showInPos: false, showOnPO: true },
      { name: 'Millilitre', abbreviation: 'ml', dimension: 'VOLUME', conversionFactor: 0.001, isDefault: true, showInPos: false, showOnPO: true },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'KITCHEN_DISPLAY', required: false }, { key: 'TABLE_MANAGEMENT', required: false },
      { key: 'RESERVATIONS', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  CAFE_QSR: {
    type: 'CAFE_QSR', label: 'Café / Quick Service', group: 'B — Food & Beverage',
    description: 'Coffee shops, fast food, juice bars, dessert shops, and takeaway counters.',
    inventoryModel: 'RECIPE_INGREDIENT', pricingMode: 'MENU_BASED', taxMode: 'FAB_STANDARD',
    units: [
      { name: 'Cup',  abbreviation: 'cup', dimension: 'COUNT', conversionFactor: 1,    isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Shot', abbreviation: 'sht', dimension: 'VOLUME', conversionFactor: 0.03, isDefault: false, showInPos: true, showOnPO: false },
      { name: 'Millilitre', abbreviation: 'ml', dimension: 'VOLUME', conversionFactor: 0.001, isDefault: true, showInPos: false, showOnPO: true },
      { name: 'Gram', abbreviation: 'g', dimension: 'WEIGHT', conversionFactor: 0.001, isDefault: true, showInPos: false, showOnPO: true },
      { name: 'Scoop', abbreviation: 'scp', dimension: 'COUNT', conversionFactor: 1, isDefault: false, showInPos: true, showOnPO: false },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'KITCHEN_DISPLAY', required: false }, { key: 'LOYALTY', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  BAR_NIGHTCLUB: {
    type: 'BAR_NIGHTCLUB', label: 'Bar / Nightclub', group: 'B — Food & Beverage',
    description: 'Bars, pubs, nightclubs, lounges, and event bars.',
    inventoryModel: 'RECIPE_INGREDIENT', pricingMode: 'MENU_BASED', taxMode: 'ALCOHOL_RATE',
    units: [
      { name: 'Shot',       abbreviation: 'sht',  dimension: 'VOLUME', conversionFactor: 0.025, isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Pint',       abbreviation: 'pnt',  dimension: 'VOLUME', conversionFactor: 0.568, isDefault: false, showInPos: true, showOnPO: false },
      { name: 'Bottle',     abbreviation: 'btl',  dimension: 'COUNT', conversionFactor: 1,      isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Millilitre', abbreviation: 'ml',   dimension: 'VOLUME', conversionFactor: 0.001, isDefault: true,  showInPos: false, showOnPO: true },
      { name: 'Keg',        abbreviation: 'keg',  dimension: 'VOLUME', conversionFactor: 50,    isDefault: false, showInPos: false, showOnPO: true },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'TAB_MANAGEMENT', required: false }, { key: 'AGE_VERIFICATION', required: false },
      { key: 'HAPPY_HOUR', required: false }, { key: 'TIPPING', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  SALON_SPA: {
    type: 'SALON_SPA', label: 'Salon / Barbershop / Spa', group: 'C — Services & Appointments',
    description: 'Hair salons, barber shops, nail salons, spas, and beauty studios.',
    inventoryModel: 'CONSUMABLE', pricingMode: 'PACKAGE_BUNDLE', taxMode: 'SERVICE_RATE',
    units: [
      { name: 'Service',    abbreviation: 'svc', dimension: 'COUNT', conversionFactor: 1,    isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Minutes',    abbreviation: 'min', dimension: 'TIME',  conversionFactor: 1,    isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Millilitre', abbreviation: 'ml',  dimension: 'VOLUME', conversionFactor: 0.001, isDefault: true, showInPos: false, showOnPO: true },
      { name: 'Gram',       abbreviation: 'g',   dimension: 'WEIGHT', conversionFactor: 0.001, isDefault: false, showInPos: false, showOnPO: true },
      { name: 'Application', abbreviation: 'app', dimension: 'COUNT', conversionFactor: 1,   isDefault: false, showInPos: true, showOnPO: false },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'SCHEDULING', required: true }, { key: 'CRM', required: false },
      { key: 'LOYALTY', required: false }, { key: 'ONLINE_BOOKING', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  CLINIC_MEDICAL: {
    type: 'CLINIC_MEDICAL', label: 'Clinic / Medical Practice', group: 'C — Services & Appointments',
    description: 'GP clinics, dental, physiotherapy, optometry, veterinary, and allied health.',
    inventoryModel: 'CONSUMABLE', pricingMode: 'TIME_BASED', taxMode: 'EXEMPT_HEALTH',
    units: [
      { name: 'Session',    abbreviation: 'ses', dimension: 'TIME',   conversionFactor: 1,        isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Minutes',    abbreviation: 'min', dimension: 'TIME',   conversionFactor: 1,        isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Milligram',  abbreviation: 'mg',  dimension: 'WEIGHT', conversionFactor: 0.000001, isDefault: true,  showInPos: false, showOnPO: true },
      { name: 'Millilitre', abbreviation: 'ml',  dimension: 'VOLUME', conversionFactor: 0.001,    isDefault: true,  showInPos: false, showOnPO: true },
      { name: 'Procedure',  abbreviation: 'prc', dimension: 'COUNT',  conversionFactor: 1,        isDefault: false, showInPos: true, showOnPO: false },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'SCHEDULING', required: true }, { key: 'PATIENT_RECORDS', required: false },
      { key: 'INSURANCE_CLAIMS', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  REPAIR_WORKSHOP: {
    type: 'REPAIR_WORKSHOP', label: 'Repair & Service Workshop', group: 'C — Services & Appointments',
    description: 'Auto repair, electronics repair, appliance service, plumbing, electrical, and maintenance trades.',
    inventoryModel: 'ASSET_SERIAL', pricingMode: 'TIME_BASED', taxMode: 'STANDARD_VAT',
    units: [
      { name: 'Hours', abbreviation: 'hr', dimension: 'TIME',   conversionFactor: 60,    isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Each',  abbreviation: 'ea', dimension: 'COUNT',  conversionFactor: 1,     isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Metre', abbreviation: 'm',  dimension: 'LENGTH', conversionFactor: 1,     isDefault: true,  showInPos: false, showOnPO: true },
      { name: 'Millilitre', abbreviation: 'ml', dimension: 'VOLUME', conversionFactor: 0.001, isDefault: true, showInPos: false, showOnPO: true },
      { name: 'Job',   abbreviation: 'job', dimension: 'COUNT', conversionFactor: 1,     isDefault: false, showInPos: true, showOnPO: false },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'WORK_ORDERS', required: true }, { key: 'TECHNICIAN_DISPATCH', required: false }, { key: 'REPORTING', required: true },
    ],
  },
  HOTEL_GUESTHOUSE: {
    type: 'HOTEL_GUESTHOUSE', label: 'Hotel / Guesthouse', group: 'D — Hospitality & Lodging',
    description: 'Hotels, boutique guesthouses, serviced apartments, and lodges.',
    inventoryModel: 'AMENITY', pricingMode: 'BED_AND_BOARD', taxMode: 'HOSPITALITY_RATE',
    units: [
      { name: 'Night',  abbreviation: 'ngt', dimension: 'TIME',  conversionFactor: 1,     isDefault: true,  showInPos: true, showOnPO: false },
      { name: 'Hours',  abbreviation: 'hr',  dimension: 'TIME',  conversionFactor: 60,    isDefault: false, showInPos: true, showOnPO: false },
      { name: 'Each',   abbreviation: 'ea',  dimension: 'COUNT', conversionFactor: 1,     isDefault: false, showInPos: true, showOnPO: true },
      { name: 'Portion', abbreviation: 'ptn', dimension: 'COUNT', conversionFactor: 1,    isDefault: false, showInPos: true, showOnPO: false },
      { name: 'Millilitre', abbreviation: 'ml', dimension: 'VOLUME', conversionFactor: 0.001, isDefault: true, showInPos: false, showOnPO: true },
    ],
    modules: [
      { key: 'POS', required: true }, { key: 'INVENTORY', required: true },
      { key: 'FOLIO_BILLING', required: true }, { key: 'RESERVATIONS', required: false },
      { key: 'HOUSEKEEPING', required: false }, { key: 'REPORTING', required: true },
    ],
  },
};

export function loadBusinessProfile(type: BusinessType | string): BusinessProfile | null {
  return PROFILES[type as BusinessType] || null;
}

export function getAllProfiles(): BusinessProfile[] {
  return Object.values(PROFILES);
}
