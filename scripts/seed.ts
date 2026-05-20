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
    ["army_boots", "Army Boots"],
    ["oxford_shoes", "Oxford Shoes"],
    ["jackets", "Jackets"],
    ["accessories", "Accessories"],
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
      name: "Pune HQ",
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
  const totp = new OTPAuth.TOTP({ issuer: "BharatBoot", secret: OTPAuth.Secret.fromBase32(adminUser.staff!.totpSecret!), digits: 6, period: 30 });
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
          businessName: "Defence Supplies Co.",
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
      sku: "BBT-ARMY-DMS-01",
      slug: "dms-army-boot",
      name: "DMS Army Combat Boot",
      category: "army_boots",
      hsn: "6403",
      basePrice: 2499_00,
      mrp: 3500_00,
      shortDescription: "Direct Moulded Sole, full-grain leather upper, padded ankle collar.",
      sizes: ["7", "8", "9", "10", "11"],
      colors: ["Olive Brown"],
    },
    {
      sku: "BBT-ARMY-JUNGLE",
      slug: "jungle-warfare-boot",
      name: "Jungle Warfare High-Top",
      category: "army_boots",
      hsn: "6403",
      basePrice: 3299_00,
      mrp: 4200_00,
      shortDescription: "Quick-drain mesh, breathable lining, vibram-pattern sole.",
      sizes: ["7", "8", "9", "10", "11"],
      colors: ["Olive Green"],
    },
    {
      sku: "BBT-OXF-CLASSIC",
      slug: "classic-oxford",
      name: "Classic Oxford — Captoe",
      category: "oxford_shoes",
      hsn: "6403",
      basePrice: 1899_00,
      mrp: 2799_00,
      shortDescription: "Full-grain leather, Goodyear-welt construction, blake-stitched.",
      sizes: ["7", "8", "9", "10", "11"],
      colors: ["Black", "Tan"],
    },
    {
      sku: "BBT-OXF-DERBY",
      slug: "derby-oxford",
      name: "Derby Lace-up",
      category: "oxford_shoes",
      hsn: "6403",
      basePrice: 1699_00,
      mrp: 2499_00,
      shortDescription: "Soft toe, open-laced — comfortable formal everyday.",
      sizes: ["7", "8", "9", "10", "11"],
      colors: ["Black"],
    },
    {
      sku: "BBT-JKT-COMBAT",
      slug: "combat-field-jacket",
      name: "Combat Field Jacket",
      category: "jackets",
      hsn: "6201",
      basePrice: 2199_00,
      mrp: 2999_00,
      shortDescription: "Water-resistant ripstop, four-pocket field design, button-flap closure.",
      sizes: ["S", "M", "L", "XL"],
      colors: ["Olive Green", "Sand"],
    },
    {
      sku: "BBT-JKT-WIND",
      slug: "windcheater-jacket",
      name: "Lightweight Windcheater",
      category: "jackets",
      hsn: "6201",
      basePrice: 1299_00,
      mrp: 1799_00,
      shortDescription: "Light shell, packable, water-resistant — for transitional weather.",
      sizes: ["S", "M", "L", "XL"],
      colors: ["Olive", "Black"],
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
        description: p.shortDescription + "\n\nBuilt at our Pune facility. ISO-9001. 12-month warranty against manufacturing defects.",
        categoryId: categories[p.category],
        hsnCode: p.hsn,
        basePrice: p.basePrice,
        mrp: p.mrp,
        status: "active",
        arEnabled: p.category !== "accessories",
        weightGrams: p.category === "jackets" ? 600 : 1100,
        metaJson: { countryOfOrigin: "India", material: p.category.startsWith("army") ? "Full-grain leather" : "Various", warrantyMonths: 12 },
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
    ["BBT-D2C", "BBT/D2C"],
    ["BBT-B2B", "BBT/B2B"],
    ["BBT-TND", "BBT/TND"],
    ["BBT-MAN", "BBT/MAN"],
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
