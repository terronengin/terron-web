import { prisma } from "../lib/prisma";
import bcrypt from "bcrypt";

async function main() {
  const email = "admin@terron.local";
  const password = "Admin123!";

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN" },
    create: { email, passwordHash, role: "ADMIN", name: "Admin" },
  });

  console.log("✅ Admin hazır:", { email, password });
  console.log("User:", user.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });