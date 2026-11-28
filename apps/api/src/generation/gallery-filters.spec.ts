import { GALLERY_STYLES, GALLERY_TAGS, dedupeHistoryJobs, parseGalleryCursor, styleCondition, tagsCondition } from "./gallery-filters";

/** Достаёт строки, которые ищутся в промпте, из условия Prisma. */
function contains(cond: any): string[] {
  return (cond.OR as any[]).filter((c) => c.input?.path?.[0] === "prompt").map((c) => c.input.string_contains);
}

describe("tagsCondition", () => {
  it("returns null for unknown tags", () => {
    expect(tagsCondition(["nope"])).toBeNull();
  });

  it("ORs tags within one group", () => {
    const cond: any = tagsCondition(["blonde", "brunette"]);
    expect(cond.AND).toBeUndefined();
    expect(contains(cond)).toEqual(expect.arrayContaining(["blonde", "brunette"]));
  });

  it("ANDs tags from different groups", () => {
    const cond: any = tagsCondition(["blonde", "bikini", "brunette"]);
    expect(cond.AND).toHaveLength(2);
    const [hair, clothing] = cond.AND;
    expect(contains(hair)).toEqual(expect.arrayContaining(["blonde", "brunette"]));
    expect(contains(hair)).not.toContain("bikini");
    expect(contains(clothing)).toEqual(expect.arrayContaining(["bikini", "swimsuit"]));
  });

  it("treats ungrouped tags as their own groups", () => {
    const cond: any = tagsCondition(["tattoo", "glasses"]);
    expect(cond.AND).toHaveLength(2);
  });

  it("every tag except tattoo/glasses has a group", () => {
    const ungrouped = GALLERY_TAGS.filter((t) => !t.group).map((t) => t.key);
    expect(ungrouped.sort()).toEqual(["glasses", "tattoo"]);
  });
});

describe("styleCondition", () => {
  it("uses the character-creation styles", () => {
    expect(GALLERY_STYLES.map((s) => s.key)).toEqual(["realistic", "semi-real", "anime", "2d"]);
  });

  it("matches generationStyle and case-insensitive key", () => {
    const cond: any = styleCondition("Semi-real");
    expect(cond.OR).toContainEqual({ input: { path: ["generationStyle"], equals: "wai-ill" } });
  });

  it("style keywords do not overlap as substrings", () => {
    for (const a of GALLERY_STYLES) {
      for (const b of GALLERY_STYLES) {
        if (a === b) continue;
        for (const ka of a.keywords) for (const kb of b.keywords) expect(kb.includes(ka)).toBe(false);
      }
    }
  });
});

describe("parseGalleryCursor", () => {
  const id = "0b1f6f7e-8a3c-4f55-9d2e-0123456789ab";
  it("parses createdAt and id", () => {
    const c = parseGalleryCursor(`2026-11-27T10:00:00.000Z_${id}`);
    expect(c?.id).toBe(id);
    expect(c?.createdAt.toISOString()).toBe("2026-11-27T10:00:00.000Z");
  });
  it("rejects garbage", () => {
    expect(parseGalleryCursor(undefined)).toBeNull();
    expect(parseGalleryCursor("abc")).toBeNull();
    expect(parseGalleryCursor(`notadate_${id}`)).toBeNull();
    expect(parseGalleryCursor("2026-11-27T10:00:00.000Z_1; drop")).toBeNull();
  });
});

describe("dedupeHistoryJobs", () => {
  const d = (s: string) => new Date(s);
  it("drops a cache copy of a photo that is already in history", () => {
    const jobs = [
      { id: "new-copy", createdAt: d("2026-11-28T10:00:00Z"), output: { url: "a.jpg" }, cachedFrom: "orig" },
      { id: "other", createdAt: d("2026-11-28T09:00:00Z"), output: { url: "b.jpg" }, cachedFrom: null },
      { id: "orig", createdAt: d("2026-11-27T10:00:00Z"), output: { url: "a.jpg" }, cachedFrom: null },
    ];
    expect(dedupeHistoryJobs(jobs).map((j) => j.id)).toEqual(["other", "orig"]);
  });
  it("keeps the earliest of two cache copies", () => {
    const jobs = [
      { id: "c2", createdAt: d("2026-11-28T10:00:00Z"), output: { url: "a.jpg" }, cachedFrom: "x" },
      { id: "c1", createdAt: d("2026-11-27T10:00:00Z"), output: { url: "a.jpg" }, cachedFrom: "x" },
    ];
    expect(dedupeHistoryJobs(jobs).map((j) => j.id)).toEqual(["c1"]);
  });
  it("keeps jobs without url", () => {
    const jobs = [{ id: "n", createdAt: d("2026-11-28T10:00:00Z"), output: null }];
    expect(dedupeHistoryJobs(jobs)).toHaveLength(1);
  });
});
