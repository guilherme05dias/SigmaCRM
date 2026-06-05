import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Busca a primeira empresa cadastrada
  const company = await prisma.company.findFirst();

  if (!company) {
    console.error('❌ Nenhuma empresa encontrada. Rode o seed primeiro.');
    process.exit(1);
  }

  // Verifica se o e-mail já existe
  const existing = await prisma.user.findUnique({
    where: { email: 'admin@sigma.com' },
  });

  if (existing) {
    console.log('⚠️  Usuário admin@sigma.com já existe. Nenhuma ação necessária.');
    return;
  }

  const newAdmin = await prisma.user.create({
    data: {
      name: 'Admin',
      email: 'admin@sigma.com',
      passwordHash: '123456',
      role: 'ADMIN',
      companyId: company.id,
    },
  });

  console.log('✅ Novo ADM criado com sucesso!');
  console.log(`   ID:    ${newAdmin.id}`);
  console.log(`   Nome:  ${newAdmin.name}`);
  console.log(`   Email: ${newAdmin.email}`);
  console.log(`   Senha: 123456`);
  console.log(`   Role:  ${newAdmin.role}`);
}

main()
  .catch((e) => {
    console.error('Erro:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
