/**
 * Symptom checker: a naive-Bayes expert system over the threat knowledge base.
 *
 *   P(threat | symptoms) ~ prior(threat | crop, weather) * prod_s P(s | threat)^[s seen] (1 - P(s | threat))^[s not seen]
 *
 * Unseen symptoms are only weakly informative (farmers report what they notice, not everything
 * that is absent), so they are tempered by `ABSENT_WEIGHT`. Current weather risk raises the
 * prior of threats the forecast models flag, and image-model predictions can be fused in as
 * extra evidence.
 */
import type { CropId } from "../crops";
import { type Symptom, type Threat, threatsForCrop } from "../knowledge";
import type { ThreatRisk } from "./disease";

const BACKGROUND = 0.04; // chance a symptom is reported for an unrelated cause
const ABSENT_WEIGHT = 0.25;

export interface Diagnosis {
  threat: Threat;
  probability: number;
  matched: Symptom[];
}

export function diagnose(
  crop: CropId,
  seen: Symptom[],
  risks: ThreatRisk[] = [],
  imageEvidence: Record<string, number> = {},
): Diagnosis[] {
  if (seen.length === 0 && Object.keys(imageEvidence).length === 0) return [];
  const candidates = threatsForCrop(crop);
  const riskBoost = new Map(risks.map((r) => [r.threatId, r.peak]));
  const scored = candidates.map((t) => {
    let logp = Math.log(t.prior);
    const peak = riskBoost.get(t.id) ?? 0;
    logp += Math.log([1, 1.3, 2, 3][peak]!);
    const matched: Symptom[] = [];
    const allSymptoms = new Set<Symptom>([...seen, ...(Object.keys(t.symptoms) as Symptom[])]);
    for (const s of allSymptoms) {
      const p = t.symptoms[s] ?? BACKGROUND;
      if (seen.includes(s)) {
        logp += Math.log(p);
        if ((t.symptoms[s] ?? 0) >= 0.3) matched.push(s);
      } else {
        logp += ABSENT_WEIGHT * Math.log(1 - p);
      }
    }
    const ev = imageEvidence[t.id];
    if (ev) logp += Math.log(1 + 8 * ev);
    return { threat: t, logp, matched };
  });
  const max = Math.max(...scored.map((s) => s.logp));
  const z = scored.reduce((sum, s) => sum + Math.exp(s.logp - max), 0);
  return scored
    .map((s) => ({ threat: s.threat, probability: Math.exp(s.logp - max) / z, matched: s.matched }))
    .sort((a, b) => b.probability - a.probability);
}
