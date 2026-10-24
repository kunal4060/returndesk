import { promises as fs } from "node:fs";
import path from "node:path";
import { Markdown } from "@/components/docs/Markdown";
import conflictsRaw from "@/data/conflicts.json";
import { asArray, str, type Rec } from "@/lib/data";

async function readDataFile(name: string): Promise<string> {
  try {
    return await fs.readFile(path.join(process.cwd(), "src", "data", name), "utf8");
  } catch {
    return `# ${name}\n\nThis document has not been seeded yet. Run \`npm run sync-data\` after the dataset lands.`;
  }
}

export default async function DocsPage() {
  const [dataCard, threatModel] = await Promise.all([
    readDataFile("data-card.md"),
    readDataFile("threat-model.md"),
  ]);
  const conflicts = asArray(conflictsRaw as unknown);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 md:px-6">
      <p className="eyebrow">Docs · For the judges</p>
      <h1 className="mt-1.5 text-[24px] font-bold tracking-tight">Data card &amp; threat model</h1>
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">
        Rendered from the same files the engine runs on — the data card describes the seeded
        dataset the demo executes, and the planted conflicts below are the cases the system is
        built to survive.
      </p>

      {conflicts.length > 0 && (
        <section className="mt-7" aria-label="Planted conflicts">
          <h2 className="text-[18px] font-semibold tracking-tight">
            The {conflicts.length} planted conflicts
          </h2>
          <div className="mt-3 overflow-hidden rounded border border-rule bg-surface">
            <table className="w-full border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-rule bg-paper text-left">
                  <th className="eyebrow px-3 py-2">ID</th>
                  <th className="eyebrow px-3 py-2">Conflict</th>
                  <th className="eyebrow px-3 py-2">Expected behaviour</th>
                </tr>
              </thead>
              <tbody>
                {conflicts.map((c: Rec) => (
                  <tr key={str(c, "id")} className="border-b border-rule align-top last:border-b-0">
                    <td className="px-3 py-2.5 font-mono text-[12px] font-semibold">{str(c, "id")}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium">{str(c, "title")}</div>
                      <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{str(c, "description")}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] leading-snug">{str(c, "expectedSystemBehaviour")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-9" aria-label="Data card">
        <Markdown source={dataCard} />
      </section>

      <section className="mt-10 border-t-2 border-ink pt-2" aria-label="Threat model">
        <Markdown source={threatModel} />
      </section>
    </div>
  );
}
