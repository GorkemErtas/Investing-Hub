// Web preview sessions are memory-only. Native uses tokenStore.native.ts.
let token: string | null = null;
export const tokenStore = {
  get: async () => token,
  set: async (value: string) => {
    token = value;
  },
  clear: async () => {
    token = null;
  },
};
