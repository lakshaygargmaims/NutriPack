import type { FoodCommodity, PackagingMaterial } from '../domain/types';

/**
 * PACKAGING STRUCTURE GENERATOR.
 * Composes multilayer candidate structures from a base material + barrier needs,
 * and explains each layer's purpose. Outputs are CANDIDATES for validation,
 * never "universally suitable" claims. Fully rule-based and traceable.
 */

export interface StructureLayer {
  material: string; // e.g. 'PET', 'AL', 'PE'
  purpose: string; // mechanical strength | high barrier | heat-sealing/contact | print surface…
  barrierRole: string;
  mechanicalRole: string;
  sealRole: string;
}

export interface GeneratedStructure {
  id: string;
  name: string; // 'PET/AL/PE'
  layers: StructureLayer[];
  rationale: string;
  tradeOffs: string[];
  estimatedCostCategory: 'low' | 'medium' | 'high';
  recyclability: 'widely' | 'limited' | 'difficult';
  /** which need drove each layer — shown as chips in the UI */
  drivenBy: string[];
  candidateStatus: 'requires validation'; // hard-coded honesty label
}

interface BarrierNeeds {
  oxygen: 'low' | 'medium' | 'high';
  moisture: 'low' | 'medium' | 'high';
  light: 'low' | 'medium' | 'high';
  mechanical: 'low' | 'medium' | 'high';
  needsSeal: boolean;
  respiring: boolean;
}

/**
 * Layer templates. Roles are described qualitatively (industry-typical), not
 * with fabricated numbers — provenance: general packaging-engineering knowledge.
 */
function layerDef(m: string): Omit<StructureLayer, 'material'> {
  switch (m) {
    case 'PET':
      return {
        purpose: 'mechanical strength + outer print surface',
        barrierRole: 'moderate gas barrier, good moisture barrier',
        mechanicalRole: 'tensile strength, dimensional stability',
        sealRole: 'not heat-sealable alone',
      };
    case 'AL':
      return {
        purpose: 'high barrier core',
        barrierRole: 'near-complete O₂/moisture/light barrier',
        mechanicalRole: 'brittle — needs protecting layers',
        sealRole: 'none',
      };
    case 'PE':
      return {
        purpose: 'heat-sealing + food-contact layer',
        barrierRole: 'moisture barrier; poor gas barrier',
        mechanicalRole: 'flexibility, impact resistance',
        sealRole: 'primary seal layer (LDPE/LLDPE)',
      };
    case 'PP':
      return {
        purpose: 'seal/stiffness layer',
        barrierRole: 'better moisture than O₂; living-hinge stiffness',
        mechanicalRole: 'stiffness, flex-crack resistance',
        sealRole: 'sealable (CPP for lamination)',
      };
    case 'Paper':
      return {
        purpose: 'rigidity + consumer-preferred look',
        barrierRole: 'poor barrier alone — needs coating/lamination',
        mechanicalRole: 'stiffness, puncture resistance',
        sealRole: 'none',
      };
    case 'EVOH':
      return {
        purpose: 'high-O₂-barrier core',
        barrierRole: 'excellent O₂ barrier (loses performance at high RH)',
        mechanicalRole: 'none significant — thin core',
        sealRole: 'none',
      };
    case 'MetPET':
      return {
        purpose: 'barrier + light block',
        barrierRole: 'very high O₂/moisture barrier, opaque',
        mechanicalRole: 'carried by adjacent PET film',
        sealRole: 'none',
      };
    default:
      return { purpose: 'structural layer', barrierRole: '—', mechanicalRole: '—', sealRole: '—' };
  }
}

function L(m: string): StructureLayer {
  return { material: m, ...layerDef(m) };
}

export function generateStructures(base: PackagingMaterial, commodity: FoodCommodity, needs: BarrierNeeds): GeneratedStructure[] {
  const out: GeneratedStructure[] = [];
  const baseName = base.name.split(' (')[0];

  // 1. Baseline: the base material itself as a monolayer candidate
  out.push({
    id: `${base.id}-mono`,
    name: baseName,
    layers: [L(base.category === 'paper' ? 'Paper' : base.id.toUpperCase().slice(0, 4))],
    rationale: `${baseName} used alone — simplest option; suitability depends on whether its native barrier matches the food's needs.`,
    tradeOffs: ['Single-layer = easiest to recycle', 'Barrier limited to the base material\'s native properties'],
    estimatedCostCategory: 'low',
    recyclability: 'widely',
    drivenBy: ['baseline'],
    candidateStatus: 'requires validation',
  });

  // 2. Standard two-layer lamination for sealable high-barrier needs
  if (needs.needsSeal && (needs.oxygen !== 'low' || needs.moisture !== 'low')) {
    out.push({
      id: `${base.id}-lam`,
      name: `PET/PE`,
      layers: [L('PET'), L('PE')],
      rationale: 'Classic 2-layer lamination: PET carries mechanical load and print, PE provides the heat-seal food-contact layer.',
      tradeOffs: ['Good balance of cost/protection', 'Multilayer PE/PET mix complicates recycling', 'Not suitable for respiring produce unless perforated'],
      estimatedCostCategory: 'medium',
      recyclability: 'limited',
      drivenBy: ['sealability', needs.oxygen !== 'low' ? 'oxygen barrier' : 'moisture barrier'],
      candidateStatus: 'requires validation',
    });
  }

  // 3. Foil-core high barrier when oxygen/light sensitivity is high
  if (needs.oxygen === 'high' || needs.light === 'high') {
    out.push({
      id: 'foil-core',
      name: 'PET/AL/PE',
      layers: [L('PET'), L('AL'), L('PE')],
      rationale: 'Aluminium-core lamination when the model flags high O₂/light sensitivity: PET → mechanical strength, AL → high barrier, PE → heat-sealing/contact layer.',
      tradeOffs: ['Near-complete barrier', 'Not suitable for respiring produce (anaerobic risk)', 'Metallised layer blocks microwave use; recycling difficult'],
      estimatedCostCategory: 'high',
      recyclability: 'difficult',
      drivenBy: [needs.oxygen === 'high' ? 'oxygen barrier' : 'light barrier'],
      candidateStatus: 'requires validation',
    });
    out.push({
      id: 'metpet-core',
      name: 'PET/MetPET/PE',
      layers: [L('PET'), L('MetPET'), L('PE')],
      rationale: 'Metallised-PET alternative to foil: slightly lower barrier at lower material cost and weight.',
      tradeOffs: ['Barrier below full foil', 'Opaque pack', 'Limited recyclability'],
      estimatedCostCategory: 'medium',
      recyclability: 'difficult',
      drivenBy: ['cost vs barrier balance'],
      candidateStatus: 'requires validation',
    });
  }

  // 4. EVOH core for transparent high-O₂-barrier needs
  if (needs.oxygen === 'high' && needs.light !== 'high') {
    out.push({
      id: 'evoh-core',
      name: 'PET/EVOH/PE',
      layers: [L('PET'), L('EVOH'), L('PE')],
      rationale: 'Transparent high-O₂-barrier structure; EVOH core gives oxygen protection while keeping product visible.',
      tradeOffs: ['EVOH barrier degrades at high humidity — verify for wet foods', '3-layer co-extrusion cost'],
      estimatedCostCategory: 'high',
      recyclability: 'limited',
      drivenBy: ['transparent oxygen barrier'],
      candidateStatus: 'requires validation',
    });
  }

  // 5. Paper-based structure when sustainability is prioritised and moisture need is moderate
  if (needs.moisture !== 'high' && needs.oxygen !== 'high') {
    out.push({
      id: 'paper-pe',
      name: 'Paper/PE',
      layers: [L('Paper'), L('PE')],
      rationale: 'Paper outer for stiffness and consumer preference, thin PE inner for seal + moisture. Candidate for moderate-barrier, sustainability-leaning briefs.',
      tradeOffs: ['Moisture barrier limited to the PE layer thickness', 'Not for long-humid routes without coating', 'PE lining complicates paper recycling streams'],
      estimatedCostCategory: 'medium',
      recyclability: 'limited',
      drivenBy: ['sustainability-leaning brief'],
      candidateStatus: 'requires validation',
    });
  }

  // 6. Micro-perforated variant when the produce is respiring
  if (needs.respiring) {
    out.push({
      id: 'micro-perf',
      name: `${baseName} (micro-perforated)`,
      layers: [L(base.category === 'paper' ? 'Paper' : 'PP')],
      rationale: `Respiring produce (respiration ${(commodity as { respirationLevel?: string }).respirationLevel ?? 'high'}): perforated film enables gas exchange and limits anaerobic risk — a MAP-compatible candidate rather than a sealed high-barrier pack.`,
      tradeOffs: ['Atmosphere depends on hole count/diameter — needs pack-trial tuning', 'Low barrier against external moisture/odours'],
      estimatedCostCategory: 'low',
      recyclability: 'widely',
      drivenBy: ['gas exchange (respiration)'],
      candidateStatus: 'requires validation',
    });
  }

  return out;
}
