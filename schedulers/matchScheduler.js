import cron from "node-cron";
import User from "../models/user.js";
import CoupleMatch from "../models/coupleMatchModel.js";

/**
 * Score pair based on hobby similarity + optional age closeness.
 */
const scorePair = (u1, u2) => {
  const h1 = (u1.hobbies || []).map(h => h.toLowerCase().trim());
  const h2 = (u2.hobbies || []).map(h => h.toLowerCase().trim());

  // Count common hobbies
  const common = h1.filter(h => h2.includes(h)).length;

  // Jaccard similarity: common/unique total (more accurate)
  const union = new Set([...h1, ...h2]).size;
  const hobbyScore = union === 0 ? 0 : (common / union); // 0–1

  // Optional: Slightly reward smaller age gap
  const ageGap = (u1.age && u2.age) ? Math.max(0, 20 - Math.abs(u1.age - u2.age)) : 0;

  // Final weighted score
  return (hobbyScore * 100) + ageGap;  // Scale similarity to 100 + age boost
};


export const initMatchScheduler = (io) => {

  // ⭐ MATCH CREATION (LOCK WINDOW STARTS)
  // → Tuesday 11:01 PM (algorithm runs, status = "pending")
  cron.schedule("1 23 * * 2", async () => {
    try {
      console.log("[matchScheduler] Running Tuesday 11:01 PM matching algorithm");

      // Get all opted-in users
      const users = await User.find({ optIn: true }).lean();
      if (users.length < 2) {
        console.log("[matchScheduler] Not enough users opted in");
        return;
      }

      // Get all previous matches to avoid repeat pairings
      const previousMatches = await CoupleMatch.find({
        status: { $in: ["matched", "pending", "accepted"] }
      }).lean();

      // Create a set of previous pairings (user1_id:user2_id)
      const previousPairings = new Set();
      previousMatches.forEach((match) => {
        if (match.couple && match.couple.length === 2) {
          const [id1, id2] = match.couple.map(id => String(id));
          // Store both directions to check either way
          previousPairings.add(`${id1}:${id2}`);
          previousPairings.add(`${id2}:${id1}`);
        }
      });

      // Helper function to check if two users were previously matched
      const werePreviouslyMatched = (userId1, userId2) => {
        return previousPairings.has(`${String(userId1)}:${String(userId2)}`);
      };

      // Split by gender
      const males = users.filter((u) => u.gender?.toLowerCase() === "man");
      const females = users.filter((u) => u.gender?.toLowerCase() === "woman");

      const matchesToCreate = [];
      const used = new Set();

      // Loop through males, match with best female
      for (const male of males) {
        if (used.has(String(male._id))) continue;

        // available females (not used and not previously matched with this male)
        const pool = females.filter((f) =>
          !used.has(String(f._id)) &&
          !werePreviouslyMatched(male._id, f._id)
        );

        if (pool.length === 0) {
          console.log(`[matchScheduler] No available new matches for user ${male._id}`);
          continue;
        }

        let best = null;
        let bestScore = -Infinity;

        for (const female of pool) {
          const s = scorePair(male, female);
          if (s > bestScore) {
            bestScore = s;
            best = female;
          }
        }

        if (best) {
          used.add(String(male._id));
          used.add(String(best._id));

          matchesToCreate.push({
            couple: [male._id, best._id],
            status: "pending",
          });
        }
      }

      if (matchesToCreate.length === 0) {
        console.log("[matchScheduler] No valid opposite-gender matches (all users may have been previously matched)");
        return;
      }

      // Save matches with "pending" status (locked window, algorithm running)
      const created = await CoupleMatch.insertMany(matchesToCreate);

      console.log(`[matchScheduler] Created ${created.length} pending matches (locked until Thursday reveal)`);

    } catch (err) {
      console.error("[matchScheduler] Error during match creation:", err);
    }
  });

  // ⭐ MATCH REVEAL / DELIVERY
  // → Thursday 12:00 AM (deliver matches, set status = "matched")
  cron.schedule("0 0 * * 4", async () => {
    try {
      console.log("[matchScheduler] Running Thursday 12:00 AM match reveal");

      // Get all pending matches created in this cycle
      const pendingMatches = await CoupleMatch.find({ status: "pending" }).lean();

      if (pendingMatches.length === 0) {
        console.log("[matchScheduler] No pending matches to reveal");
        return;
      }

      // Update status to "matched"
      const ids = pendingMatches.map((m) => m._id);
      await CoupleMatch.updateMany(
        { _id: { $in: ids } },
        { status: "matched" }
      );

      // Emit match delivery events to users
      pendingMatches.forEach((m) => {
        m.couple.forEach((uid) => {
          if (io) io.to(`user:${uid}`).emit("match:delivered", { match: m });
        });
      });

      console.log(`[matchScheduler] Revealed ${pendingMatches.length} matches to users`);

    } catch (err) {
      console.error("[matchScheduler] Error during match reveal:", err);
    }
  });

  // ⭐ RESET OPT-IN + NEW WEEK BEGINS
  // → Thursday 12:01 AM (reset opt-in status, start new cycle)
  cron.schedule("1 0 * * 4", async () => {
    try {
      console.log("[matchScheduler] Running Thursday 12:01 AM opt-in reset + new week");
      await User.updateMany({}, { optIn: false });
      if (io) io.emit("optin:reset");
      console.log("[matchScheduler] Opt-in reset complete, new weekly cycle started");
    } catch (err) {
      console.error("[matchScheduler] Opt-in reset error:", err);
    }
  });

  console.log("[matchScheduler] ALL CRON JOBS INITIALIZED");
};
