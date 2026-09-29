/**
 * LiveFlow — Seed di sviluppo.
 * Crea un'agency demo + un utente OWNER per poter fare login subito.
 * Idempotente: rilanciabile senza duplicare.
 *
 * Credenziali demo:
 *   email:    demo@liveflow.dev
 *   password: liveflow123
 */
import { PrismaClient, Role, Platform } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const agency = await prisma.agency.upsert({
    where: { slug: 'demo' },
    update: {},
    create: { name: 'Demo Agency', slug: 'demo' },
  });

  const passwordHash = await argon2.hash('liveflow123');
  const owner = await prisma.user.upsert({
    where: { email: 'demo@liveflow.dev' },
    update: { passwordHash, role: Role.OWNER, agencyId: agency.id },
    create: {
      email: 'demo@liveflow.dev',
      passwordHash,
      role: Role.OWNER,
      displayName: 'Demo Owner',
      agencyId: agency.id,
    },
  });

  // Una creator demo con account collegati (per la pagina Go Live)
  const creator = await prisma.creator.upsert({
    where: { userId: owner.id },
    update: {},
    create: { displayName: 'Luna Star', agencyId: agency.id, userId: owner.id },
  });

  const platforms: Platform[] = [
    Platform.CHATURBATE,
    Platform.STRIPCHAT,
    Platform.MYFREECAMS,
  ];
  for (const platform of platforms) {
    await prisma.connectedAccount.upsert({
      where: { creatorId_platform: { creatorId: creator.id, platform } },
      update: {},
      create: {
        platform,
        // Placeholder: in produzione cifrato AES-256-GCM (vedi CryptoService TODO)
        encryptedCreds: Buffer.from(
          JSON.stringify({ streamKey: 'demo' }),
        ).toString('base64'),
        platformUsername: `luna_${platform.toLowerCase()}`,
        agencyId: agency.id,
        creatorId: creator.id,
      },
    });
  }

  console.log('Seed completato:');
  console.log('  Agency:', agency.name, `(${agency.slug})`);
  console.log('  Login:  demo@liveflow.dev / liveflow123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
