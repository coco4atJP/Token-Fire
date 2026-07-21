import { energyLabelAt } from "../domain/energyScale";
import { getWorldMetrics, type WorldState } from "../domain/world";
import type { ProjectSummary } from "../infrastructure/worldPersistence";
import { downloadBlob } from "./replayExporter";

export const exportEnvironmentalDebtReport = (world: WorldState, projects: ProjectSummary[]): void => {
  const metrics = getWorldMetrics(world);
  const report = `<!doctype html>
<meta charset="utf-8">
<title>Token-Fire Environmental Debt Report</title>
<style>
body{max-width:920px;margin:48px auto;padding:0 24px;background:#171719;color:#eee6d8;font:16px/1.7 system-ui,sans-serif}h1,h2{color:#ffd36b}section{margin:24px 0;padding:20px;border:1px solid #5e4b32;border-radius:12px;background:#232124}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{padding:14px;border-radius:10px;background:#302b27}.value{font-size:28px;font-weight:800}.fine{color:#a9a29a;font-size:13px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:9px;border-bottom:1px solid #45403b}
</style>
<h1>Token-Fire 環境債務報告書</h1>
<p>${escapeHtml(world.projectLabel)}事業所の株主向け説明資料です。キャラクターは可愛く、事業判断は非情です。</p>
<section><h2>当期ハイライト</h2><div class="grid">
<div class="metric"><div>Token焼却</div><div class="value">${metrics.totalTokensBurned.toLocaleString()}</div></div>
<div class="metric"><div>ふわっとした多さ</div><div class="value">${escapeHtml(energyLabelAt(metrics.energyLevel))}</div></div>
<div class="metric"><div>森林在庫処理</div><div class="value">${world.debt.treesHarvested.toLocaleString()}本</div></div>
<div class="metric"><div>成果ゼロToken</div><div class="value">${metrics.wastedTokens.toLocaleString()}</div></div>
<div class="metric"><div>設備段階</div><div class="value">${metrics.growthLevel + 1}/24</div></div>
<div class="metric"><div>グリーンウォッシュ</div><div class="value">${world.debt.greenwashCeremonies.toLocaleString()}回</div></div>
</div></section>
<section><h2>代表コメント</h2><p>${escapeHtml(executiveComment(world))}</p></section>
<section><h2>最近こういうこともありました</h2>${world.history.slice(0, 12).map((moment) => `<p><strong>${escapeHtml(moment.title)}</strong><br>${escapeHtml(moment.line)} <span class="fine">${new Date(moment.at).toLocaleString("ja-JP")}</span></p>`).join("") || "<p>まだ報告できる事故はありません。</p>"}</section>
<section><h2>事業所一覧</h2><table><thead><tr><th>事業所</th><th>Token</th><th>設備</th><th>記録</th></tr></thead><tbody>${projects.map((project) => `<tr><td>${escapeHtml(project.label)}</td><td>${project.totalTokens.toLocaleString()}</td><td>${project.growthLevel + 1}/24</td><td>${project.historyCount}</td></tr>`).join("")}</tbody></table></section>
<p class="fine">この報告書の「多さ」はToken量・モデル名・並列度から作った風刺的な相対表現です。実測Wh、CO₂、水使用量ではありません。</p>`;
  downloadBlob(new Blob([report], { type: "text/html;charset=utf-8" }), `${safeName(world.projectLabel)}-environmental-debt.html`);
};

const executiveComment = (world: WorldState): string => {
  if (world.debt.wastedTokens > world.debt.totalTokensBurned * 0.25) return "失敗は多かったものの、熱と煙については計画を上回りました。";
  if (world.growthLevel >= 18) return "工場は景観の一部になりました。景観の方は、ほぼ残っていません。";
  if (world.debt.forestWipeouts > 0) return "森林在庫を一度きれいに棚卸しできたことを誇りに思います。";
  if (world.chill > 0.7) return "現在は次回の燃焼へ向け、静かに森林在庫を再生産しています。";
  return "Tokenは燃やしてこそ価値がある。今後も慎重かつ大胆に焼却します。";
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
const safeName = (value: string): string => value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 80) || "token-fire";
