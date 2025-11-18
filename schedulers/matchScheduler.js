import cron from "node-cron";
import User from "../models/user.js";
import CoupleMatch from "../models/coupleMatchModel.js";

/**
 * Simple matching algorithm:
 * - Run weekly on Tuesday 23:01 to compute candidate matches from opted-in users.
 * - Preference given to opposite gender (basic) and scored by:
 *     +50 same religion, +10 per shared hobby, +5 per shared personality trait
 * - Avoid double-matching a user in the same run.
 * - Create CoupleMatch docs with status "pending".
 * - On Thursday 00:00 mark matches "matched" (delivered) and emit notifications.
 * - On Thursday 00:01 reset users optIn to false for new week.
 *
 * Call initMatchScheduler(io) from your server start after io is available.
 */

const scorePair = (a, b) => {
  let score = 0;
  if (!a || !b) return score;
  if (a.religion && b.religion && a.religion === b.religion) score += 50;

  const hobbiesA = new Set(a.hobbies || []);
  const hobbiesB = new Set(b.hobbies || []);
  let sharedHobbies = 0;
  hobbiesA.forEach(h => { if (hobbiesB.has(h)) sharedHobbies++; });
  score += sharedHobbies * 10;

  const persA = new Set(a.personality || []);
  const persB = new Set(b.personality || []);
  let sharedPers = 0;
  persA.forEach(p => { if (persB.has(p)) sharedPers++; });
  score += sharedPers * 5;

  return score;
};

export const initMatchScheduler = (io) => {
  // Compute candidate matches: every Tuesday at 23:01
  cron.schedule("1 23 * * 2", async () => {
    try {
      console.log("[matchScheduler] Running weekly match job (Tue 23:01)");

      // Fetch users who opted in
      const users = await User.find({ optIn: true }).lean();
      if (!users || users.length < 2) {
        console.log("[matchScheduler] Not enough opted-in users to match");
        return;
      }

      // Quick grouping by gender
      const byGender = users.reduce((acc, u) => {
        const g = (u.gender || "unknown").toLowerCase();
        acc[g] = acc[g] || [];
        acc[g].push(u);
        return acc;
      }, {});

      const used = new Set();
      const matchesToCreate = [];

      // For each user try to find best opposite-gender match
      for (const user of users) {
        if (used.has(String(user._id))) continue;

        // choose candidate pool: prefer opposite gender groups
        const oppositeGenders = Object.keys(byGender).filter(g => g && g !== (user.gender || "").toLowerCase());
        let pool = [];
        for (const g of oppositeGenders) pool = pool.concat(byGender[g] || []);

        // fallback to any other users not used
        if (pool.length === 0) {
          pool = users.filter(u => String(u._id) !== String(user._id));
        }

        // filter out already used candidates
        pool = pool.filter(c => !used.has(String(c._id)) && String(c._id) !== String(user._id));

        if (pool.length === 0) continue;

        // score candidates
        let best = null;
        let bestScore = -Infinity;
        for (const candidate of pool) {
          const s = scorePair(user, candidate);
          if (s > bestScore) {
            bestScore = s;
            best = candidate;
          }
        }

        if (best) {
          used.add(String(user._id));
          used.add(String(best._id));
          matchesToCreate.push({
            couple: [user._id, best._id],
            status: "pending",
          });
        }
      }

      if (matchesToCreate.length === 0) {
        console.log("[matchScheduler] No matches produced this run");
        return;
      }

      // Create matches in DB
      const created = await CoupleMatch.insertMany(matchesToCreate);

      // Emit socket events to users
      created.forEach((m) => {
        m.couple.forEach((uid) => {
          if (io) io.to(`user:${uid}`).emit("match:created", { match: m });
        });
      });

      console.log(`[matchScheduler] Created ${created.length} matches`);
    } catch (err) {
      console.error("[matchScheduler] Error creating matches:", err);
    }
  });

  // Mark matches delivered every Thursday at 00:00
  cron.schedule("0 0 * * 4", async () => {
    try {
      console.log("[matchScheduler] Delivering matches (Thu 00:00)");
      // find pending matches
      const pending = await CoupleMatch.find({ status: "pending" });
      if (!pending.length) {
        console.log("[matchScheduler] No pending matches to deliver");
        return;
      }

      // mark as matched
      const ids = pending.map(p => p._id);
      await CoupleMatch.updateMany({ _id: { $in: ids } }, { status: "matched" });

      // emit delivered event
      pending.forEach((m) => {
        m.couple.forEach((uid) => {
          if (io) io.to(`user:${uid}`).emit("match:delivered", { match: m });
        });
      });

      console.log(`[matchScheduler] Delivered ${pending.length} matches`);
    } catch (err) {
      console.error("[matchScheduler] Error delivering matches:", err);
    }
  });

  // Reset all users optIn every Thursday at 00:01 (new week)
  cron.schedule("1 0 * * 4", async () => {
    try {
      console.log("[matchScheduler] Resetting user optIn flags (Thu 00:01)");
      await User.updateMany({ optIn: true }, { optIn: false });
      if (io) io.emit("optin:reset", { message: "Weekly opt-in reset" });
      console.log("[matchScheduler] optIn reset completed");
    } catch (err) {
      console.error("[matchScheduler] Error resetting optIns:", err);
    }
  });

  console.log("[matchScheduler] Cron jobs initialized");
};