import { db } from "../src/lib/db";

async function promoteModerator() {
  const unsentId = process.argv[2];
  if (!unsentId) {
    console.error("Usage: pnpm exec tsx scripts/promote-moderator.ts <unsentId>");
    process.exit(1);
  }

  const user = await db.user.findUnique({
    where: { unsentId },
  });

  if (!user) {
    console.error(`User with unsentId '${unsentId}' not found.`);
    process.exit(1);
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: { role: "MODERATOR" },
  });

  console.log(`Successfully promoted ${updated.unsentId} (${updated.id}) to role: ${updated.role}`);
  await db.$disconnect();
}

promoteModerator().catch((err) => {
  console.error(err);
  process.exit(1);
});
