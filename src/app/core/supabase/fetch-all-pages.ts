// Tiene que ser <= max_rows de PostgREST (1000, ver supabase/config.toml): si fuera mayor,
// cada pagina volveria cortada y quedarian huecos entre una y otra.
const PAGE_SIZE = 1000;

interface PageResult<T> {
  data: T[] | null;
  count: number | null;
  error: unknown;
}

// PostgREST corta cualquier respuesta en max_rows sin dar error -- una lista pedida en una sola
// consulta pierde en silencio todo lo que pase de 1000 filas. Esto pide por paginas: la primera
// trae el total (count: 'exact' cuando withCount es true) y el resto sale en paralelo.
// La consulta tiene que tener un orden total (ej. .order('name').order('id')): con empates en
// el orden, Postgres no garantiza el mismo orden entre paginas y se repetirian/saltearian filas.
export async function fetchAllPages<T>(
  page: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const first = await page(0, PAGE_SIZE - 1, true);
  if (first.error) throw first.error;

  const rows = [...(first.data ?? [])];
  const offsets: number[] = [];
  for (let from = PAGE_SIZE; from < (first.count ?? 0); from += PAGE_SIZE) offsets.push(from);

  const rest = await Promise.all(offsets.map((from) => page(from, from + PAGE_SIZE - 1, false)));
  for (const result of rest) {
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
  }
  return rows;
}
