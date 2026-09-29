import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";
import {
  createAdapterUser,
  deleteAdapterUser,
  getUserByAccount,
  getUserByEmail,
  getUserById,
  linkAuthAccount,
  unlinkAuthAccount,
  updateAdapterUser,
  type AuthUser,
} from "./repository";

function adapterUser(user: AuthUser): AdapterUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    image: user.image,
  };
}

export const cohorioAuthAdapter: Adapter = {
  async createUser(user) {
    return adapterUser(
      await createAdapterUser({
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
      }),
    );
  },
  async getUser(id) {
    const user = await getUserById(id);
    return user ? adapterUser(user) : null;
  },
  async getUserByEmail(email) {
    const user = await getUserByEmail(email);
    return user ? adapterUser(user) : null;
  },
  async getUserByAccount(account) {
    const user = await getUserByAccount(
      account.provider,
      account.providerAccountId,
    );
    return user ? adapterUser(user) : null;
  },
  async updateUser(user) {
    return adapterUser(await updateAdapterUser(user.id, user));
  },
  async deleteUser(id) {
    await deleteAdapterUser(id);
  },
  async linkAccount(account) {
    await linkAuthAccount(account);
    return account as AdapterAccount;
  },
  async unlinkAccount(account) {
    await unlinkAuthAccount(account.provider, account.providerAccountId);
  },
};
