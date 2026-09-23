/**
 * generate-goals.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Groq-powered WEEK-LONG day-to-day task generation for onboarding (and the
 * dashboard's "Generate my plan" action).
 *
 * Sends the student's SWOT analysis, free-text goals, and selected goal tags
 * to Groq (qwen/qwen3.8-27b) and returns a 7-DAY adaptive plan:
 *   - visible_goals: 3-5 short weekly goal statements (summary UI)
 *   - day_plan:      7 entries (day_offset 0..6), each with 3-4 CONCRETE tasks
 *
 * persistence: persistGeneratedPlan() flattens day_plan into ONE daily_goals
 * row PER TASK (a day with 4 topics → 4 rows on that date), so the dashboard's
 * "Daily Goals" card shows 3-4 tasks per day.
 *
 * Falls back to a deterministic 7-day plan when no API key is configured or
 * the API fails, so onboarding NEVER blocks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface GeneratedGoals {
  roadmap_title?: string;
  visible_goals: string[];
  day_plan: {
    day_offset: number;
    topics: string[];
    problems_count: number;
  }[];
  source: "groq" | "fallback";
}

const GROQ_MODEL = "qwen/qwen3.8-27b";
const PLAN_DAYS = 7;

/** Deterministic 7-day fallback: 3 tasks/day, progressive difficulty. */
function buildFallbackPlan(): GeneratedGoals {
  const dayPlans = [
    ["Diagnostic quiz on core subjects", "Review yesterday's lecture notes", "List 3 weak topics from MSE"],
    ["Drill weak topic #1 (theory recap)", "Solve 5 basic problems on it", "Write one-page summary sheet"],
    ["Drill weak topic #2 (theory recap)", "Solve 5 guided examples", "Flashcard revision (20 min)"],
    ["Timed mini-mock (45 min)", "Review mistakes from mock", "Re-solve 3 wrong problems"],
    ["Drill weak topic #3", "Mixed problem set (10 problems)", "Formula sheet consolidation"],
    ["Full-length mock (90 min)", "Error-log review", "Plan next week's focus"],
    ["Light review: flashcards + notes", "Doubt-clearing session/notes", "Update SWOT progress"],
  ];
  const day_plan = dayPlans.map((topics, i) => ({
    day_offset: i,
    topics: [...topics],
    problems_count: i === 6 ? 2 : 3,
  }));
  return {
    roadmap_title: "7-Day Foundation Reset Plan",
    visible_goals: [
      "Diagnose weak topics and build a summary sheet",
      "Drill each weak topic with guided problem sets",
      "Two mocks with full error-log review",
      "Consolidate formulas and set next week's focus",
    ],
    day_plan,
    source: "fallback",
  };
}

const FALLBACK = buildFallbackPlan();

/** Minimal sanitizer: strips control chars and prompt-injection framing. */
function sanitize(input: string, maxLen: number): string {
  return input
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ")
    .replace(/```/g, "'''")
    .slice(0, maxLen)
    .trim();
}

/**
 * Persists a GeneratedGoals plan to the backend:
 *  - deletes stale goals from previous plans (so regenerating doesn't stack plans)
 *  - creates ONE roadmap for the plan
 *  - flattens day_plan into ONE daily_goals row PER TASK (3-4 rows/day)
 * Returns the number of task rows inserted. Throws on backend failure.
 */
export async function persistGeneratedPlan(
  plan: GeneratedGoals,
  authedFetch: (path: string, init?: RequestInit) => Promise<Response>
): Promise<number> {
  // Clear any previous plan's rows first (older roadmap rows, sparse old plans)
  try {
    await authedFetch("/api/goals", { method: "DELETE" });
  } catch {
    // Non-fatal — old rows may linger if this fails
  }

  const rmRes = await authedFetch("/api/roadmap", {
    method: "POST",
    body: JSON.stringify({
      title: plan.roadmap_title || "My Week Plan",
      total_topics: plan.day_plan.reduce((n, d) => n + d.topics.length, 0),
    }),
  });
  const rmData = rmRes.ok ? await rmRes.json() : null;
  const roadmapId = rmData?.roadmap_id;

  // Flatten: each topic becomes its own DailyGoal row dated day_offset days out.
  const today = new Date();
  const goalRows = plan.day_plan.flatMap((day) =>
    day.topics.map((topic) => {
      const d = new Date(today);
      d.setDate(d.getDate() + day.day_offset);
      return {
        roadmap_id: roadmapId,
        target_date: d.toISOString().split("T")[0],
        topics: [topic],
        problems_count: day.problems_count,
      };
    })
  );

  if (goalRows.length === 0) return 0;

  const goalsRes = await authedFetch("/api/goals", {
    method: "POST",
    body: JSON.stringify({ goals: goalRows }),
  });
  if (!goalsRes.ok) throw new Error(`Failed to persist plan (${goalsRes.status})`);
  const gd = await goalsRes.json();
  return gd.inserted ?? goalRows.length;
}

export async function generateGoalsFromProfile(profile: {
  swot: { strengths: string; weaknesses: string; opportunities: string; threats: string };
  goals: string;
  goalTags: string[];
  department?: string;
  semester?: number;
}): Promise<GeneratedGoals> {
  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
  if (!apiKey || apiKey === "your_groq_api_key_here") {
    return FALLBACK;
  }

  const prompt = `You are TUFY, an AI academic planner for an engineering student.

Student profile (self-reported):
- SWOT Strengths: ${sanitize(profile.swot.strengths, 400) || "not provided"}
- SWOT Weaknesses: ${sanitize(profile.swot.weaknesses, 400) || "not provided"}
- SWOT Opportunities: ${sanitize(profile.swot.opportunities, 400) || "not provided"}
- SWOT Threats: ${sanitize(profile.swot.threats, 400) || "not provided"}
- Stated goals: ${sanitize(profile.goals, 400) || "not provided"}
- Goal tags: ${profile.goalTags.join(", ") || "none"}
- Department: ${sanitize(profile.department || "Engineering", 80)}; Semester: ${profile.semester ?? 4}

Produce a PERSONALIZED ${PLAN_DAYS}-DAY day-to-day study plan (exactly ${PLAN_DAYS} entries, day_offset 0..${
    PLAN_DAYS - 1
  }, day 0 = TODAY) built around the student's weaknesses, strengths, threats and stated goals.

Rules:
1. EVERY day must have 3-4 CONCRETE, SPECIFIC tasks in its topics array — never vague statements.
2. Each task must be completable in ONE study session (e.g. "Solve 5 integration problems from
   previous-year papers", NOT "practice math").
3. Tasks must explicitly reference the student's weak subjects and stated goals wherever possible.
4. Progressive difficulty across the week: diagnose → drill weak areas → timed practice →
   consolidation + a short review of what worked. Day 7 is a lighter review day.
5. No task may span multiple days; each is self-contained.

Return ONLY valid JSON matching exactly this schema:
{
  "roadmap_title": "short plan title",
  "visible_goals": ["3 to 5 weekly goal statements (max 90 chars each)"],
  "day_plan": [
    { "day_offset": 0, "topics": ["task 1", "task 2", "task 3", "task 4"], "problems_count": 3 },
    ...
    { "day_offset": 6, "topics": ["task 1", "task 2"], "problems_count": 2 }
  ]
}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a curriculum planner. Output ONLY raw JSON without markdown or commentary.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      console.warn(`[generate-goals] Groq error ${response.status}; using fallback.`);
      return FALLBACK;
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return FALLBACK;

    const parsed = JSON.parse(content);
    const visibleGoals: string[] = Array.isArray(parsed.visible_goals)
      ? parsed.visible_goals.filter((g: unknown) => typeof g === "string").slice(0, 5)
      : [];

    interface RawDayPlanItem {
      day_offset?: number;
      topics?: unknown[];
      problems_count?: number;
    }

    const seenOffsets = new Set<number>();
    const dayPlan = Array.isArray(parsed.day_plan)
      ? (parsed.day_plan as RawDayPlanItem[])
          .filter((d): d is RawDayPlanItem & { day_offset: number; topics: unknown[] } => {
            if (!d || typeof d.day_offset !== "number" || !Number.isFinite(d.day_offset)) return false;
            const off = Math.floor(d.day_offset);
            if (off < 0 || off >= PLAN_DAYS || seenOffsets.has(off)) return false;
            if (!Array.isArray(d.topics) || d.topics.length === 0) return false;
            seenOffsets.add(off);
            return true;
          })
          .map((d) => ({
            day_offset: Math.floor(d.day_offset),
            topics: d.topics.filter((t: unknown): t is string => typeof t === "string").slice(0, 4),
            problems_count: Number(d.problems_count) > 0 ? Math.floor(Number(d.problems_count)) : 3,
          }))
          .sort((a, b) => a.day_offset - b.day_offset)
      : [];

    // Require a full week before trusting the LLM output
    if (visibleGoals.length === 0 || dayPlan.length < PLAN_DAYS) {
      console.warn(`[generate-goals] plan too short (${dayPlan.length}/${PLAN_DAYS} days); using fallback.`);
      return FALLBACK;
    }

    return {
      roadmap_title: typeof parsed.roadmap_title === "string" ? parsed.roadmap_title : undefined,
      visible_goals: visibleGoals,
      day_plan: dayPlan,
      source: "groq",
    };
  } catch (err) {
    console.warn("[generate-goals] generation failed; using fallback:", err);
    return FALLBACK;
  }
}
