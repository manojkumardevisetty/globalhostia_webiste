// next/cache outside Next (scripts/snapshot.mjs): no data cache, every call reads the database
export const unstable_cache = (fn) => fn;
export const revalidateTag = () => {};
export const revalidatePath = () => {};
