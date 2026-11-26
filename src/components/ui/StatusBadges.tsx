import { DIGITAL_STATUS, OPPORTUNITY, type DigitalStatus, type OpportunityLevel } from "../../lib/constants";
import { Badge } from "./index";

export function DigitalStatusBadge({ status }: { status: DigitalStatus }) {
  const s = DIGITAL_STATUS[status] ?? DIGITAL_STATUS.unknown;
  return <Badge className={s.color}><span className="size-1.5 rounded-full" style={{ background: s.hex }} />{s.label}</Badge>;
}

export function OpportunityBadge({ level, score }: { level: OpportunityLevel | null; score?: number | null }) {
  if (!level) return <Badge>Não classificado</Badge>;
  const o = OPPORTUNITY[level];
  return <Badge className={o.color}>{o.label}{score != null && <span className="opacity-70">· {score}</span>}</Badge>;
}
