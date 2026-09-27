import type { ReferenceSource } from './types';

/**
 * PACKAGING COMPONENT DATABASES (NutriPack complete-solution upgrade).
 * These tables extend — never replace — the existing material database.
 * Every entry is DEMO/REFERENCE data: qualitative compatibility knowledge for
 * the decision-support prototype, not laboratory-certified specifications.
 * Where a property is unknown we use 'unknown' rather than inventing a value.
 */

export type DataType = 'demo' | 'reference';
export type Level = 'low' | 'medium' | 'high' | 'unknown';

export interface PackagingFormat {
  id: string;
  name: string;
  category: 'flexible' | 'rigid' | 'specialized';
  flexibility: Level;
  rigidity: Level;
  ventilationCapability: Level;
  stackability: Level;
  resealability: Level;
  tamperEvidenceCapability: Level;
  leakResistance: Level;
  /** can this format hold a free-pouring liquid without a secondary inner bag? */
  liquidSuitable: boolean;
  typicalApplications: string[];
  /** commodity categories this format suits (hard filter alongside material) */
  foodCompatibility: string[];
  description: string;
  /** material ids that can realistically be made into this format */
  compatibleMaterialIds: string[];
  source: string;
  dataType: DataType;
}

export interface Closure {
  id: string;
  name: string;
  type: 'screw' | 'snap' | 'zip' | 'heat' | 'tamper' | 'other';
  compatibleFormatIds: string[];
  compatibleMaterialIds: string[]; // empty = material-agnostic
  resealable: boolean;
  tamperEvidence: boolean;
  leakResistance: Level;
  foodContactStatus: 'food-contact' | 'not-food-contact';
  description: string;
  source: string;
  dataType: DataType;
}

export interface SealingMethod {
  id: string;
  name: string;
  compatibleMaterialIds: string[];
  compatibleFormatIds: string[]; // empty = any flexible/rigid as appropriate
  sealStrength: Level;
  hermeticPotential: Level;
  equipmentRequirement: string;
  description: string;
  source: string;
  dataType: DataType;
}

export interface SecondaryPackaging {
  id: string;
  name: string;
  material: string;
  loadCapacityKg: number | null; // null = data unavailable
  stackability: Level;
  protection: Level;
  moistureResistance: Level;
  reusePotential: Level;
  foodContactRequired: boolean;
  typicalApplications: string[];
  description: string;
  source: string;
  dataType: DataType;
}

export interface TertiaryPackaging {
  id: string;
  name: string;
  material: string;
  loadCapacityKg: number | null;
  stackability: Level;
  reusability: Level;
  mechanicalProtection: Level;
  moistureProtection: Level;
  temperatureProtection: Level;
  typicalTransport: string[];
  coldChainSuitable: boolean;
  description: string;
  source: string;
  dataType: DataType;
}

export const PACKAGING_FORMATS: PackagingFormat[] = [
  // FLEXIBLE
  { id: 'fmt-pillow-pouch', name: 'Pillow pouch', category: 'flexible', flexibility: 'high', rigidity: 'low', ventilationCapability: 'low', stackability: 'medium', resealability: 'low', tamperEvidenceCapability: 'low', leakResistance: 'medium', typicalApplications: ['Snacks', 'Biscuits'], foodCompatibility: ['snack', 'bakery', 'processed'], compatibleMaterialIds: ['ldpe', 'pp', 'pet', 'multi-3layer', 'met-pet', 'biodeg-starch'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Simple back-sealed flexible pouch — the workhorse of dry-food packaging.', liquidSuitable: false, },
  { id: 'fmt-standup-pouch', name: 'Stand-up pouch', category: 'flexible', flexibility: 'high', rigidity: 'low', ventilationCapability: 'low', stackability: 'medium', resealability: 'medium', tamperEvidenceCapability: 'medium', leakResistance: 'medium', typicalApplications: ['Spices', 'Powders', 'Dried fruit'], foodCompatibility: ['spice', 'pulse', 'snack', 'processed', 'cereal'], compatibleMaterialIds: ['ldpe', 'pp', 'pet', 'multi-3layer', 'met-pet', 'biodeg-starch', 'paper'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Bottom-gusseted pouch that stands on shelf; often with zip.', liquidSuitable: false, },
  { id: 'fmt-vac-pouch', name: 'Vacuum pouch', category: 'flexible', flexibility: 'high', rigidity: 'low', ventilationCapability: 'low', stackability: 'low', resealability: 'low', tamperEvidenceCapability: 'medium', leakResistance: 'high', typicalApplications: ['Cheese', 'Meat', 'Fish'], foodCompatibility: ['dairy', 'processed'], compatibleMaterialIds: ['ldpe', 'pa', 'multi-3layer', 'pet'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'High-barrier pouch for vacuum packing; removes headspace O₂.', liquidSuitable: false, },
  { id: 'fmt-retort-pouch', name: 'Retort pouch', category: 'flexible', flexibility: 'high', rigidity: 'low', ventilationCapability: 'low', stackability: 'low', resealability: 'low', tamperEvidenceCapability: 'medium', leakResistance: 'high', typicalApplications: ['Ready meals', 'Curries'], foodCompatibility: ['processed'], compatibleMaterialIds: ['pet', 'pp', 'multi-3layer', 'al-foil'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Heat-sterilizable laminated pouch (121 °C capable).', liquidSuitable: true, },
  { id: 'fmt-woven-bag', name: 'Woven bag', category: 'flexible', flexibility: 'medium', rigidity: 'low', ventilationCapability: 'medium', stackability: 'medium', resealability: 'low', tamperEvidenceCapability: 'low', leakResistance: 'low', typicalApplications: ['Grains', 'Pulses', 'Sugar', 'Onion'], foodCompatibility: ['cereal', 'pulse', 'spice', 'vegetable'], compatibleMaterialIds: ['hdpe', 'pp', 'jute'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Strong woven sack for bulk dry goods; breathes, low moisture barrier.', liquidSuitable: false, },
  { id: 'fmt-sachet', name: 'Sachet', category: 'flexible', flexibility: 'high', rigidity: 'low', ventilationCapability: 'low', stackability: 'low', resealability: 'low', tamperEvidenceCapability: 'low', leakResistance: 'medium', typicalApplications: ['Ketchup', 'Shampoo', 'Single-serve'], foodCompatibility: ['processed', 'beverage'], compatibleMaterialIds: ['ldpe', 'pp', 'pet', 'multi-3layer'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Single-serve sealed sachet for liquids/pastes.', liquidSuitable: true, },
  { id: 'fmt-bulk-bag', name: 'FIBC bulk bag', category: 'flexible', flexibility: 'medium', rigidity: 'low', ventilationCapability: 'medium', stackability: 'low', resealability: 'low', tamperEvidenceCapability: 'low', leakResistance: 'low', typicalApplications: ['Grains in bulk', 'Pulses 500+ kg'], foodCompatibility: ['cereal', 'pulse'], compatibleMaterialIds: ['pp', 'hdpe'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: '1-tonne-class flexible intermediate bulk container.', liquidSuitable: false, },
  // RIGID
  { id: 'fmt-bottle', name: 'Bottle', category: 'rigid', flexibility: 'low', rigidity: 'high', ventilationCapability: 'low', stackability: 'low', resealability: 'high', tamperEvidenceCapability: 'high', leakResistance: 'high', typicalApplications: ['Water', 'Oils', 'Juices', 'Milk'], foodCompatibility: ['beverage', 'dairy', 'processed'], compatibleMaterialIds: ['pet', 'hdpe', 'pp', 'pla', 'glass'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Rigid container with threaded neck for liquid foods.', liquidSuitable: true, },
  { id: 'fmt-jar', name: 'Jar', category: 'rigid', flexibility: 'low', rigidity: 'high', ventilationCapability: 'low', stackability: 'low', resealability: 'high', tamperEvidenceCapability: 'high', leakResistance: 'high', typicalApplications: ['Pickles', 'Spices', 'Ghee'], foodCompatibility: ['spice', 'processed'], compatibleMaterialIds: ['pet', 'pp', 'glass'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Wide-mouth rigid container; premium look, excellent barrier (glass).', liquidSuitable: true, },
  { id: 'fmt-tub', name: 'Tub / container', category: 'rigid', flexibility: 'low', rigidity: 'medium', ventilationCapability: 'low', stackability: 'medium', resealability: 'high', tamperEvidenceCapability: 'medium', leakResistance: 'medium', typicalApplications: ['Dairy', 'Ice cream', 'Dried snacks'], foodCompatibility: ['dairy', 'snack', 'processed', 'bakery'], compatibleMaterialIds: ['pp', 'hdpe', 'pet', 'pla', 'paper'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Wide-mouth injection-moulded container with lid.', liquidSuitable: true, },
  { id: 'fmt-tray', name: 'Tray', category: 'rigid', flexibility: 'low', rigidity: 'medium', ventilationCapability: 'low', stackability: 'low', resealability: 'low', tamperEvidenceCapability: 'low', leakResistance: 'medium', typicalApplications: ['Fresh cut produce', 'Meat', 'Sweets'], foodCompatibility: ['vegetable', 'fruit', 'dairy', 'processed'], compatibleMaterialIds: ['pet', 'pp', 'pla', 'paper', 'biodeg-starch'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Display tray, usually overwrapped or lidded.', liquidSuitable: false, },
  { id: 'fmt-can-tin', name: 'Can / tin', category: 'rigid', flexibility: 'low', rigidity: 'high', ventilationCapability: 'low', stackability: 'high', resealability: 'low', tamperEvidenceCapability: 'high', leakResistance: 'high', typicalApplications: ['Retorted foods', 'Beverages', 'Oils'], foodCompatibility: ['processed', 'beverage'], compatibleMaterialIds: ['steel', 'aluminium'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Hermetic metal container for sterilized foods.', liquidSuitable: true, },
  // SPECIALIZED
  { id: 'fmt-ventilated-crate', name: 'Ventilated produce pack', category: 'specialized', flexibility: 'low', rigidity: 'medium', ventilationCapability: 'high', stackability: 'high', resealability: 'low', tamperEvidenceCapability: 'low', leakResistance: 'low', typicalApplications: ['Fresh tomato', 'Vegetables', 'Fruits'], foodCompatibility: ['vegetable', 'fruit'], compatibleMaterialIds: ['pp', 'hdpe', 'paper', 'pla', 'biodeg-starch'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Vented punnet/crate allowing respiration heat and moisture to escape — the default for respiring produce.', liquidSuitable: false, },
  { id: 'fmt-clamshell', name: 'Clamshell', category: 'specialized', flexibility: 'low', rigidity: 'medium', ventilationCapability: 'medium', stackability: 'medium', resealability: 'medium', tamperEvidenceCapability: 'low', leakResistance: 'medium', typicalApplications: ['Berries', 'Cherry tomato', 'Snacking veg'], foodCompatibility: ['fruit', 'vegetable'], compatibleMaterialIds: ['pet', 'pp', 'pla', 'biodeg-starch'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Hinged one-piece container protecting delicate produce.', liquidSuitable: false, },
  { id: 'fmt-map-pouch', name: 'MAP-compatible pouch', category: 'specialized', flexibility: 'high', rigidity: 'low', ventilationCapability: 'low', stackability: 'medium', resealability: 'low', tamperEvidenceCapability: 'medium', leakResistance: 'high', typicalApplications: ['Fresh-cut salad', 'Minimally processed produce'], foodCompatibility: ['vegetable', 'fruit'], compatibleMaterialIds: ['pet', 'pp', 'multi-3layer', 'ldpe'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Film with OTR matched to produce respiration for modified-atmosphere shelf life.', liquidSuitable: false, },
  { id: 'fmt-insulated-box', name: 'Insulated shipper', category: 'specialized', flexibility: 'low', rigidity: 'high', ventilationCapability: 'low', stackability: 'medium', resealability: 'low', tamperEvidenceCapability: 'low', leakResistance: 'medium', typicalApplications: ['Cold-chain export', 'Dairy', 'Frozen'], foodCompatibility: ['dairy', 'processed', 'fruit', 'vegetable'], compatibleMaterialIds: ['paper', 'hdpe', 'pp'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'EPS/wool/paper insulated box holding cold temperature in transit.', liquidSuitable: true, },
];

export const CLOSURES: Closure[] = [
  { id: 'clo-heat-seal', name: 'Heat-seal fin (single-use)', type: 'heat', compatibleFormatIds: ['fmt-pillow-pouch', 'fmt-standup-pouch', 'fmt-vac-pouch', 'fmt-retort-pouch', 'fmt-sachet', 'fmt-map-pouch'], compatibleMaterialIds: ['ldpe', 'pp', 'pet', 'multi-3layer', 'met-pet', 'pla', 'biodeg-starch', 'al-foil', 'pa'], resealable: false, tamperEvidence: true, leakResistance: 'high', foodContactStatus: 'food-contact', description: 'Machine-applied fin/gusset seal — the default for flexible films.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-zip', name: 'Zip lock (press-to-close)', type: 'zip', compatibleFormatIds: ['fmt-standup-pouch', 'fmt-pillow-pouch', 'fmt-tub'], compatibleMaterialIds: ['ldpe', 'pp', 'pet', 'multi-3layer'], resealable: true, tamperEvidence: false, leakResistance: 'medium', foodContactStatus: 'food-contact', description: 'Integrated reclosable profile for multi-serve pouches.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-slider', name: 'Slider closure', type: 'zip', compatibleFormatIds: ['fmt-standup-pouch'], compatibleMaterialIds: ['ldpe', 'pp', 'multi-3layer'], resealable: true, tamperEvidence: false, leakResistance: 'medium', foodContactStatus: 'food-contact', description: 'Slider-guided reclosure — easier than a zip for wet/slippery films.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-screw-cap', name: 'Screw cap', type: 'screw', compatibleFormatIds: ['fmt-bottle', 'fmt-jar', 'fmt-tub'], compatibleMaterialIds: [], resealable: true, tamperEvidence: false, leakResistance: 'high', foodContactStatus: 'food-contact', description: 'Threaded closure for bottles/jars; often with liner.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-flip-top', name: 'Flip-top cap', type: 'screw', compatibleFormatIds: ['fmt-bottle', 'fmt-tub'], compatibleMaterialIds: [], resealable: true, tamperEvidence: false, leakResistance: 'medium', foodContactStatus: 'food-contact', description: 'Hinged one-piece dispensing closure.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-snap-fit', name: 'Snap-fit lid', type: 'snap', compatibleFormatIds: ['fmt-tub', 'fmt-tray', 'fmt-clamshell'], compatibleMaterialIds: [], resealable: true, tamperEvidence: false, leakResistance: 'medium', foodContactStatus: 'food-contact', description: 'Friction-fit lid for tubs/trays; quick open-close.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-induction', name: 'Induction heat-seal liner', type: 'tamper', compatibleFormatIds: ['fmt-bottle', 'fmt-jar', 'fmt-tub'], compatibleMaterialIds: [], resealable: false, tamperEvidence: true, leakResistance: 'high', foodContactStatus: 'food-contact', description: 'Foil laminate bonded to the container mouth under an induction field — tamper evidence + leak resistance.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-tear-notch', name: 'Tear notch', type: 'other', compatibleFormatIds: ['fmt-pillow-pouch', 'fmt-sachet', 'fmt-standup-pouch', 'fmt-vac-pouch', 'fmt-map-pouch'], compatibleMaterialIds: [], resealable: false, tamperEvidence: true, leakResistance: 'low', foodContactStatus: 'food-contact', description: 'Scored notch for easy opening of sealed pouches.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-tamper-band', name: 'Tamper-evident band/shrink sleeve', type: 'tamper', compatibleFormatIds: ['fmt-bottle', 'fmt-jar', 'fmt-tub'], compatibleMaterialIds: [], resealable: true, tamperEvidence: true, leakResistance: 'low', foodContactStatus: 'not-food-contact', description: 'Neck band or sleeve that breaks on first opening.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'clo-bung', name: 'Drum bung / plug cap', type: 'screw', compatibleFormatIds: ['fmt-can-tin'], compatibleMaterialIds: ['steel', 'aluminium'], resealable: true, tamperEvidence: false, leakResistance: 'high', foodContactStatus: 'food-contact', description: 'Large threaded plug for drums/tins (edible-oil drums).', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
];

export const SEALING_METHODS: SealingMethod[] = [
  { id: 'seal-heat-bar', name: 'Heat sealing (bar/impulse)', compatibleMaterialIds: ['ldpe', 'pp', 'pet', 'multi-3layer', 'met-pet', 'pla', 'biodeg-starch', 'al-foil', 'pa'], compatibleFormatIds: [], sealStrength: 'medium', hermeticPotential: 'medium', equipmentRequirement: 'Band or impulse sealer (widely available)', description: 'Thermoplastic seal layer melted under pressure — the standard flexible-pack seal.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'seal-ultrasonic', name: 'Ultrasonic sealing', compatibleMaterialIds: ['ldpe', 'pp', 'pet', 'multi-3layer', 'pla'], compatibleFormatIds: [], sealStrength: 'high', hermeticPotential: 'high', equipmentRequirement: 'Ultrasonic sealer (specialized)', description: 'Vibration-welded seal; works through contamination (product in seal area).', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'seal-induction', name: 'Induction sealing', compatibleMaterialIds: [], compatibleFormatIds: ['fmt-bottle', 'fmt-jar', 'fmt-tub'], sealStrength: 'high', hermeticPotential: 'high', equipmentRequirement: 'Induction sealer + lined caps', description: 'Bonds a foil liner to the container mouth — liquid-leak and tamper standard.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'seal-adhesive', name: 'Adhesive (glue) sealing', compatibleMaterialIds: ['paper'], compatibleFormatIds: [], sealStrength: 'low', hermeticPotential: 'low', equipmentRequirement: 'Glue gun / applicator', description: 'Cold or hot-melt glue for paper bags/cartons; not hermetic.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'seal-mechanical', name: 'Mechanical closure (clip/stitch)', compatibleMaterialIds: ['jute', 'hdpe', 'pp', 'paper'], compatibleFormatIds: [], sealStrength: 'medium', hermeticPotential: 'low', equipmentRequirement: 'Stitcher / clipper', description: 'Sewn or clipped sack closure — recyclable with the bag, not airtight.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'seal-crimp', name: 'Crimping', compatibleMaterialIds: ['aluminium', 'steel'], compatibleFormatIds: ['fmt-can-tin'], sealStrength: 'high', hermeticPotential: 'high', equipmentRequirement: 'Can seamer', description: 'Double-seam for metal cans — fully hermetic.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'seal-lidding', name: 'Lidding film / peelable lid', compatibleMaterialIds: ['pet', 'pp', 'ldpe', 'multi-3layer', 'pla'], compatibleFormatIds: ['fmt-tray', 'fmt-tub', 'fmt-clamshell'], sealStrength: 'medium', hermeticPotential: 'medium', equipmentRequirement: 'Tray sealer', description: 'Heat-sealed peelable lid on rigid trays/tubs; MAP-capable.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
  { id: 'seal-vac', name: 'Vacuum + seal', compatibleMaterialIds: ['ldpe', 'pa', 'pet', 'multi-3layer'], compatibleFormatIds: ['fmt-vac-pouch'], sealStrength: 'high', hermeticPotential: 'high', equipmentRequirement: 'Chamber vacuum sealer', description: 'Air removed then sealed — kills oxidation for cheese/meat/coffee.', source: 'Industry-typical knowledge (demo)', dataType: 'demo' },
];

export const SECONDARY_PACKAGING: SecondaryPackaging[] = [
  { id: 'sec-corrugated', name: 'Corrugated carton (RSC)', material: 'Paperboard (corrugated)', loadCapacityKg: 20, stackability: 'high', protection: 'high', moistureResistance: 'low', reusePotential: 'low', foodContactRequired: false, typicalApplications: ['Master case for pouches', 'Retail-ready case'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: '5–7 ply regular-slotted case — the universal shipping unit; keep off wet floors.' },
  { id: 'sec-folding-carton', name: 'Folding carton', material: 'Paperboard', loadCapacityKg: 1, stackability: 'medium', protection: 'medium', moistureResistance: 'low', reusePotential: 'low', foodContactRequired: true, typicalApplications: ['Primary-ish retail carton for sachets'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Printed retail carton grouping single units.' },
  { id: 'sec-shrink-wrap', name: 'Shrink-wrap multipack', material: 'LDPE film', loadCapacityKg: 12, stackability: 'medium', protection: 'low', moistureResistance: 'medium', reusePotential: 'low', foodContactRequired: false, typicalApplications: ['Bottle multipacks', 'Can wraps'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Film bundle of units; light protection, low cost.' },
  { id: 'sec-dividers', name: 'Divider/partition system', material: 'Paperboard', loadCapacityKg: null, stackability: 'low', protection: 'high', moistureResistance: 'low', reusePotential: 'low', foodContactRequired: false, typicalApplications: ['Glass jars', 'Eggs', 'Delicate produce'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Cell partitions preventing unit-to-unit crushing.' },
  { id: 'sec-crate-plastic', name: 'Plastic crate (stack-nest)', material: 'HDPE/PP', loadCapacityKg: 25, stackability: 'high', protection: 'high', moistureResistance: 'high', reusePotential: 'high', foodContactRequired: true, typicalApplications: ['Tomato', 'Mango', 'Vegetables'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Returnable ventilated crate for fresh produce.' },
  { id: 'sec-crate-wood', name: 'Wooden crate', material: 'Wood', loadCapacityKg: 30, stackability: 'medium', protection: 'medium', moistureResistance: 'medium', reusePotential: 'medium', foodContactRequired: true, typicalApplications: ['Hard produce', 'Traditional mandi trade'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Traditional produce crate; splinter risk for soft fruit (demo note).' },
  { id: 'sec-rigid-box', name: 'Rigid gift/box', material: 'Paperboard (solid)', loadCapacityKg: 3, stackability: 'low', protection: 'high', moistureResistance: 'low', reusePotential: 'medium', foodContactRequired: true, typicalApplications: ['Sweets', 'Premium gifting'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Set-up box for premium presentation.' },
  { id: 'sec-tray-board', name: 'Display tray (board)', material: 'Paperboard', loadCapacityKg: 5, stackability: 'low', protection: 'low', moistureResistance: 'low', reusePotential: 'low', foodContactRequired: false, typicalApplications: ['Retail shelf-ready units'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Shelf-ready tray carrying multiple primary packs.' },
  { id: 'sec-multipack', name: 'Paper multipack wrap', material: 'Paperboard/LDPE', loadCapacityKg: 2, stackability: 'medium', protection: 'low', moistureResistance: 'low', reusePotential: 'low', foodContactRequired: false, typicalApplications: ['Biscuit rolls', 'Snack bundles'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Bundles consumer units into one purchasable pack.' },
  { id: 'sec-insulated-liner', name: 'Insulated box liner', material: 'EPS/wool/paper', loadCapacityKg: 15, stackability: 'medium', protection: 'high', moistureResistance: 'medium', reusePotential: 'medium', foodContactRequired: false, typicalApplications: ['Cold-chain dairy', 'Frozen', 'Chocolate'], source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Insulation insert inside a corrugated shipper for cold chain.' },
];

export const TERTIARY_PACKAGING: TertiaryPackaging[] = [
  { id: 'ter-pallet', name: 'Palletized unit load', material: 'Wood/plastic pallet + load', loadCapacityKg: 1000, stackability: 'high', reusability: 'high', mechanicalProtection: 'medium', moistureProtection: 'low', temperatureProtection: 'low', typicalTransport: ['Truck', 'Rail', 'Sea'], coldChainSuitable: true, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Standard unit-load platform; the base of all tertiary protection.' },
  { id: 'ter-stretch-film', name: 'Stretch wrap', material: 'LLDPE film', loadCapacityKg: null, stackability: 'high', reusability: 'low', mechanicalProtection: 'medium', moistureProtection: 'medium', temperatureProtection: 'low', typicalTransport: ['Truck', 'Rail', 'Sea'], coldChainSuitable: true, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Unitises the pallet load; also topsplash/moisture protection.' },
  { id: 'ter-strapping', name: 'Strapping + corner protectors', material: 'PP/PET strap, board corners', loadCapacityKg: null, stackability: 'high', reusability: 'low', mechanicalProtection: 'medium', moistureProtection: 'low', temperatureProtection: 'low', typicalTransport: ['Truck', 'Rail'], coldChainSuitable: true, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Load stabilisation and edge protection on pallets.' },
  { id: 'ter-dunnage', name: 'Dunnage (void fill)', material: 'Paper/air pillows', loadCapacityKg: null, stackability: 'low', reusability: 'low', mechanicalProtection: 'high', moistureProtection: 'low', temperatureProtection: 'low', typicalTransport: ['Truck', 'Air'], coldChainSuitable: false, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Fills voids in shipping boxes so units do not shift.' },
  { id: 'ter-ship-box', name: 'Corrugated shipping box', material: 'Corrugated board', loadCapacityKg: 25, stackability: 'high', reusability: 'low', mechanicalProtection: 'high', moistureProtection: 'low', temperatureProtection: 'low', typicalTransport: ['Truck', 'Air', 'Courier'], coldChainSuitable: false, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Single-parcel shipper for e-commerce/courier legs.' },
  { id: 'ter-bulk-ibc', name: 'IBC / bulk container', material: 'HDPE on steel cage', loadCapacityKg: 1250, stackability: 'medium', reusability: 'high', mechanicalProtection: 'high', moistureProtection: 'high', temperatureProtection: 'low', typicalTransport: ['Truck', 'Sea'], coldChainSuitable: false, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Intermediate bulk container for liquids and granular bulk.' },
  { id: 'ter-insulated', name: 'Insulated thermal container', material: 'EPS/PU + pallet', loadCapacityKg: 300, stackability: 'medium', reusability: 'medium', mechanicalProtection: 'medium', moistureProtection: 'medium', temperatureProtection: 'high', typicalTransport: ['Reefer truck', 'Air'], coldChainSuitable: true, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Passive thermal protection maintaining cold chain without power.' },
  { id: 'ter-reefer', name: 'Refrigerated transport (reefer)', material: 'Vehicle/container', loadCapacityKg: null, stackability: 'high', reusability: 'high', mechanicalProtection: 'medium', moistureProtection: 'medium', temperatureProtection: 'high', typicalTransport: ['Reefer truck', 'Reefer container'], coldChainSuitable: true, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Active temperature-controlled transport — a service, not a package, but part of the configuration.' },
  { id: 'ter-crate-return', name: 'Returnable crate pool', material: 'HDPE crate', loadCapacityKg: 25, stackability: 'high', reusability: 'high', mechanicalProtection: 'high', moistureProtection: 'high', temperatureProtection: 'low', typicalTransport: ['Truck'], coldChainSuitable: true, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Pooled RPCs (returnable plastic crates) for farm-to-DC produce.' },
  { id: 'ter-drum', name: 'Steel/HDPE drum', material: 'Steel or HDPE', loadCapacityKg: 220, stackability: 'low', reusability: 'high', mechanicalProtection: 'high', moistureProtection: 'high', temperatureProtection: 'low', typicalTransport: ['Truck', 'Sea'], coldChainSuitable: false, source: 'Industry-typical knowledge (demo)', dataType: 'demo', description: 'Bulk liquid edible-oil container (with bung closure).' },
];

/** Optional inner components — included by the engine only when required. */
export interface InnerComponent {
  id: string;
  name: string;
  purpose: string;
  whenRequired: (flags: { moistureSensitive: boolean; respiring: boolean; liquid: boolean; fragile: boolean; awLow: boolean }) => boolean;
  dataType: DataType;
}

export const INNER_COMPONENTS: InnerComponent[] = [
  { id: 'inner-moisture-barrier', name: 'Moisture-barrier liner bag', purpose: 'Keeps hygroscopic food dry inside a breathable woven/paper outer', whenRequired: (f) => f.moistureSensitive && f.awLow, dataType: 'demo' },
  { id: 'inner-absorbent-pad', name: 'Absorbent pad', purpose: 'Catches drip/juice in meat, fish and washed-produce packs', whenRequired: (f) => f.liquid && !f.respiring, dataType: 'demo' },
  { id: 'inner-cushion', name: 'Cushioning insert', purpose: 'Protects fragile units from impact damage', whenRequired: (f) => f.fragile, dataType: 'demo' },
  { id: 'inner-dividers', name: 'Cell dividers', purpose: 'Separates units to stop bruising and stacking damage', whenRequired: (f) => f.fragile, dataType: 'demo' },
  { id: 'inner-paper-wrap', name: 'Food-grade paper interleaf', purpose: 'Cheap grease/moisture interleaf inside paper-based packs', whenRequired: (f) => f.moistureSensitive && !f.liquid, dataType: 'demo' },
];

// Re-export the source registry type for convenience of consumers
export type { ReferenceSource };
