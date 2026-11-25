import { query } from "@/lib/database";
import type { ProfileInput, UserProfile } from "@/lib/onboarding";

type UserProfileRow = {
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  updated_at: Date | string;
};

function publicProfile(row: UserProfileRow): UserProfile {
  return {
    userId: row.user_id,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    phone: row.phone ?? "",
    addressLine1: row.address_line1 ?? "",
    city: row.city ?? "",
    region: row.region ?? "",
    postalCode: row.postal_code ?? "",
    country: row.country ?? "",
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

const COLUMNS = `user_id, first_name, last_name, phone, address_line1,
  city, region, postal_code, country, updated_at`;

function empty(value: string) {
  return value.trim() ? value.trim() : null;
}

export async function getUserProfile(userId: string) {
  const result = await query<UserProfileRow>(
    `SELECT ${COLUMNS} FROM user_profiles WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0] ? publicProfile(result.rows[0]) : null;
}

export async function saveUserProfile(userId: string, input: ProfileInput) {
  const result = await query<UserProfileRow>(
    `INSERT INTO user_profiles (
       user_id, first_name, last_name, phone, address_line1,
       city, region, postal_code, country, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       first_name = EXCLUDED.first_name,
       last_name = EXCLUDED.last_name,
       phone = EXCLUDED.phone,
       address_line1 = EXCLUDED.address_line1,
       city = EXCLUDED.city,
       region = EXCLUDED.region,
       postal_code = EXCLUDED.postal_code,
       country = EXCLUDED.country,
       updated_at = NOW()
     RETURNING ${COLUMNS}`,
    [
      userId,
      input.firstName.trim(),
      input.lastName.trim(),
      empty(input.phone ?? ""),
      empty(input.addressLine1 ?? ""),
      empty(input.city ?? ""),
      empty(input.region ?? ""),
      empty(input.postalCode ?? ""),
      empty(input.country ?? ""),
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Unable to save profile.");
  return publicProfile(row);
}
