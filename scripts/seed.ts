/**
 * Seed script — populates demo data so the storefront / admin / wholesale are usable
 * out of the box.
 *
 * Run: pnpm db:seed
 *
 * Idempotent: re-running will upsert.
 */
import { prisma } from "../packages/db/src/index";
import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";

const STAFF_PASSWORD = "ChangeMe123!";
const DEALER_PASSWORD = "Dealer123!";
const CUSTOMER_PASSWORD = "Customer123!";

async function main() {
  console.log("🌱 Seeding demo data…");

  // ---- Categories ----
  const categories: Record<string, string> = {};
  for (const [slug, name] of [
    ["boots", "Service & Army Boots"],
    ["shoes", "Formal Shoes"],
    ["jackets", "Jackets"],
    ["bags", "Leather Bags"],
  ] as const) {
    const c = await prisma.category.upsert({
      where: { slug },
      update: {},
      create: { slug, name },
    });
    categories[slug] = c.id;
  }

  // ---- Warehouse ----
  const warehouse = await prisma.warehouse.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Agra factory",
      gstin: process.env.SELLER_GSTIN || null,
      isActive: true,
    },
  });

  // ---- Staff admin ----
  const totpSecret = new OTPAuth.Secret().base32;
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@bharatboot.local" },
    update: { isActive: true },
    create: {
      email: "admin@bharatboot.local",
      phone: "9999900001",
      passwordHash: await bcrypt.hash(STAFF_PASSWORD, 10),
      userType: "staff",
      isActive: true,
      emailVerifiedAt: new Date(),
      staff: {
        create: {
          fullName: "Admin User",
          role: "super_admin",
          totpSecret,
          totpEnabled: true,
        },
      },
    },
    include: { staff: true },
  });

  console.log("👤 Admin login:");
  console.log(`   email: admin@bharatboot.local`);
  console.log(`   password: ${STAFF_PASSWORD}`);
  console.log(`   TOTP secret (add to Google Authenticator / Aegis): ${adminUser.staff?.totpSecret}`);
  const totp = new OTPAuth.TOTP({ issuer: "IDEALX", secret: OTPAuth.Secret.fromBase32(adminUser.staff!.totpSecret!), digits: 6, period: 30 });
  console.log(`   Current TOTP code (use within 30s): ${totp.generate()}`);

  // ---- Dealer price lists ----
  for (const [tier, name] of [
    ["tier_a", "Tier A (volume)"],
    ["tier_b", "Tier B (standard)"],
    ["tier_c", "Tier C (entry)"],
  ] as const) {
    await prisma.dealerPriceList.upsert({
      where: { tier },
      update: {},
      create: { tier, name, isActive: true },
    });
  }

  // ---- Demo dealer ----
  await prisma.user.upsert({
    where: { email: "dealer1@bharatboot.local" },
    update: {},
    create: {
      email: "dealer1@bharatboot.local",
      phone: "9999900002",
      passwordHash: await bcrypt.hash(DEALER_PASSWORD, 10),
      userType: "dealer",
      isActive: true,
      emailVerifiedAt: new Date(),
      dealer: {
        create: {
          businessName: "Sadar Leather Mart",
          gstin: "27AAAPL1234C1ZV",
          pan: "AAAPL1234C",
          status: "approved",
          priceTier: "tier_a",
          creditLimit: 50_000_00, // ₹50,000 in paise
          creditUsed: 0,
          paymentTermsDays: 30,
          approvedAt: new Date(),
        },
      },
    },
  });

  // ---- Demo customer ----
  await prisma.user.upsert({
    where: { email: "customer1@bharatboot.local" },
    update: {},
    create: {
      email: "customer1@bharatboot.local",
      phone: "9999900003",
      passwordHash: await bcrypt.hash(CUSTOMER_PASSWORD, 10),
      userType: "customer",
      isActive: true,
      emailVerifiedAt: new Date(),
      customer: {
        create: { name: "Demo Customer" },
      },
    },
  });

  console.log("👤 Dealer login: dealer1@bharatboot.local / " + DEALER_PASSWORD);
  console.log("👤 Customer login: customer1@bharatboot.local / " + CUSTOMER_PASSWORD);

  // ---- Demo products ----
  const products = [
    {
      sku: "IDX-BOOT-DMS",
      slug: "dms-service-boot",
      name: "DMS Service Boot",
      category: "boots",
      hsn: "6403",
      basePrice: 2899_00,
      mrp: 3999_00,
      shortDescription: "Direct-moulded sole, full-grain leather upper, padded ankle collar. Built for all-day service wear.",
      sizes: ["6", "7", "8", "9", "10", "11"],
      colors: ["Black", "Dark Brown"],
    },
    {
      sku: "IDX-BOOT-HIGH",
      slug: "high-ankle-boot",
      name: "High-Ankle Boot",
      category: "boots",
      hsn: "6403",
      basePrice: 3499_00,
      mrp: 4799_00,
      shortDescription: "High-ankle lace-up with speed hooks, full-grain upper, stitched rubber sole.",
      sizes: ["6", "7", "8", "9", "10", "11"],
      colors: ["Black", "Tan"],
    },
    {
      sku: "IDX-OXF-PLAIN",
      slug: "plain-toe-oxford",
      name: "Plain-Toe Oxford",
      category: "shoes",
      hsn: "6403",
      basePrice: 2699_00,
      mrp: 3699_00,
      shortDescription: "Closed-lace Oxford in full-grain leather, leather insole, stitched sole. The office pair.",
      sizes: ["6", "7", "8", "9", "10", "11"],
      colors: ["Black", "Dark Brown"],
    },
    {
      sku: "IDX-OXF-CAPTOE",
      slug: "cap-toe-oxford",
      name: "Cap-Toe Oxford",
      category: "shoes",
      hsn: "6403",
      basePrice: 2899_00,
      mrp: 3999_00,
      shortDescription: "Cap-toe Oxford, full-grain upper, leather lining, stitched sole. For uniforms and occasions.",
      sizes: ["6", "7", "8", "9", "10", "11"],
      colors: ["Black", "Tan"],
    },
    {
      sku: "IDX-JKT-FIELD",
      slug: "field-jacket",
      name: "Field Jacket",
      category: "jackets",
      hsn: "6201",
      basePrice: 2499_00,
      mrp: 3499_00,
      shortDescription: "Four-pocket field jacket, water-resistant shell, button-flap closures. Cut and sewn in-house.",
      sizes: ["S", "M", "L", "XL"],
      colors: ["Dark Brown", "Black"],
    },
    {
      sku: "IDX-BAG-MSGR",
      slug: "leather-messenger",
      name: "Leather Messenger",
      category: "bags",
      hsn: "4202",
      basePrice: 3499_00,
      mrp: 4999_00,
      shortDescription: "Full-grain leather messenger with a 13-inch laptop sleeve. Made in limited runs.",
      sizes: ["OS"],
      colors: ["Tan", "Dark Brown"],
    },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku,
        slug: p.slug,
        name: p.name,
        shortDescription: p.shortDescription,
        description: p.shortDescription + "\n\nMade in our own factory in Agra. Exchange within 30 days.",
        categoryId: categories[p.category],
        hsnCode: p.hsn,
        basePrice: p.basePrice,
        mrp: p.mrp,
        status: "active",
        arEnabled: p.category !== "accessories",
        weightGrams: p.category === "jackets" ? 600 : p.category === "bags" ? 1200 : p.category === "boots" ? 1400 : 1000,
        metaJson: { countryOfOrigin: "India", material: p.category === "jackets" ? "Water-resistant shell" : "Full-grain leather", madeIn: "Agra, Uttar Pradesh", exchangeDays: 30 },
      },
    });

    for (const size of p.sizes) {
      for (const color of p.colors) {
        const vSku = `${p.sku}-${size}-${color.replace(/\s+/g, "")}`.toUpperCase();
        const variant = await prisma.productVariant.upsert({
          where: { sku: vSku },
          update: {},
          create: {
            productId: product.id,
            sku: vSku,
            size,
            color,
            isActive: true,
          },
        });

        // Inventory + initial stock movement (purchase ledger entry)
        const existing = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
        if (!existing) {
          const initial = 50;
          await prisma.inventory.create({
            data: { variantId: variant.id, warehouseId: warehouse.id, onHand: initial, reorderPoint: 10 },
          });
          await prisma.stockMovement.create({
            data: {
              variantId: variant.id,
              warehouseId: warehouse.id,
              delta: initial,
              reason: "purchase",
              note: "Initial seed",
            },
          });
        }

        // Tier-A dealer price = 70%, tier-B = 80%, tier-C = 90% of base
        const tierAList = await prisma.dealerPriceList.findUnique({ where: { tier: "tier_a" } });
        const tierBList = await prisma.dealerPriceList.findUnique({ where: { tier: "tier_b" } });
        const tierCList = await prisma.dealerPriceList.findUnique({ where: { tier: "tier_c" } });
        for (const [list, factor] of [
          [tierAList, 0.70],
          [tierBList, 0.80],
          [tierCList, 0.90],
        ] as const) {
          if (!list) continue;
          await prisma.dealerPriceListEntry.upsert({
            where: {
              priceListId_variantId_minQuantity: {
                priceListId: list.id,
                variantId: variant.id,
                minQuantity: 1,
              },
            },
            update: { price: Math.round(p.basePrice * factor) },
            create: {
              priceListId: list.id,
              variantId: variant.id,
              price: Math.round(p.basePrice * factor),
              minQuantity: 1,
            },
          });
        }
      }
    }
  }

  // ---- Invoice series seeded so first invoice has correct prefix ----
  const fy = (() => {
    const d = new Date();
    const sy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
    return `${sy}-${((sy + 1) % 100).toString().padStart(2, "0")}`;
  })();
  for (const [code, prefix] of [
    ["IDX-D2C", "IDX/D2C"],
    ["IDX-B2B", "IDX/B2B"],
    ["IDX-TND", "IDX/TND"],
    ["IDX-MAN", "IDX/MAN"],
  ] as const) {
    await prisma.invoiceSeries.upsert({
      where: { code_financialYear: { code, financialYear: fy } },
      update: {},
      create: { code, financialYear: fy, prefix, nextNumber: 1 },
    });
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
