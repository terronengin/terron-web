let prismaInstance: any = null;

export async function getPrisma() {
  if (prismaInstance) return prismaInstance;

  const mod = await import("@prisma/client");
  const PrismaClientCtor = (mod as any).PrismaClient;

  if (!PrismaClientCtor) {
    throw new Error("@prisma/client içinde PrismaClient bulunamadı.");
  }

  prismaInstance = new PrismaClientCtor();
  return prismaInstance;
}

export const prisma = new Proxy(
  {},
  {
    get(_target, prop) {
      return async (...args: any[]) => {
        const client = await getPrisma();
        const value = client[prop as keyof typeof client];
        if (typeof value === "function") {
          return (value as any).apply(client, args);
        }
        return value;
      };
    },
  }
) as any;