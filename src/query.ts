import type { Static, TArray, TSchema } from "@sinclair/typebox";
import {
  and,
  desc,
  eq,
  getTableName,
  type SQL,
  type TableConfig,
} from "drizzle-orm";
import type { PgTableWithColumns } from "drizzle-orm/pg-core";
import { error, type ElysiaCustomStatusResponse } from "elysia/error";
import { database, type Database } from "./database";
import { Value } from "@sinclair/typebox/value";

const _isTArray = <T extends TSchema>(schema: TSchema): schema is TArray<T> =>
  schema.type === "array";

const _formatItem = (name: string, multiple: boolean) => {
  if (multiple) return name;
  const shortened = name.substring(0, name.length - 1);
  if (shortened.endsWith("ie"))
    return `${shortened.substring(0, shortened.length - 2)}y`;
  return shortened;
};

export type Identifier = string | number;

/**
 * query is a function that is used to query the database and parse/transform the result according to the provided TypeBox schema.
 *
 * __REQUIRED PARAMETERS__
 * @param table The table to query.
 * @param schema The TypeBox schema to parse the result with.
 *
 * __OPTION "id"__
 * @param id The id of the record(s) to query.
 * @param idColumn The column where the id should be found.
 *
 * __OPTION "query"__
 * @param query The sql`` query to execute (your `where` clause).
 *
 * __OPTION "complex"__
 * @param complex The complex `drizzle.query.table.findMany()` query to execute.
 *
 * __ADDITIONAL PARAMETERS__
 * @param order The order the result should be sorted by.
 * @param opaque
 * * ``false`` (default) -> function returns ``Result | ElysiaCustomStatusResponse...``
 * * ``true`` -> function returns ``Result | undefined``
 *
 * @returns The result of the query, parsed according to the provided TypeBox schema or error specified by opaque.
 */
export async function query<
  Schema extends TSchema,
  Config extends TableConfig,
  Column extends PgTableWithColumns<Config>[keyof Config["columns"]],
  Order extends Column | SQL<PgTableWithColumns<Config>>,
  ReturnError extends Opaque extends true
    ? undefined
    :
        | ElysiaCustomStatusResponse<404, `${string} not found`, 404>
        | ElysiaCustomStatusResponse<
            500,
            `couldn't retrieve ${string}` | `couldn't query ${string}`,
            500
          >
        | ElysiaCustomStatusResponse<503, `database is not ready`, 503>,
  Return extends Data | ReturnError,
  Complex extends (drizzle: Database) => Promise<Data | undefined>,
  Query extends SQL<PgTableWithColumns<Config>>,
  Opaque extends true | false | undefined = undefined,
  Data = Static<Schema>
>({
  id,
  idColumn,
  order,
  table,
  schema,
  query,
  complex,
  opaque = false,
}: {
  table: PgTableWithColumns<Config>;
} & (
  | {
      option?: "id";
      id: Identifier;
      idColumn: Column;
      order?: Order;
      schema: Schema;
      query?: undefined;
      complex?: undefined;
      opaque?: Opaque;
    }
  | {
      option?: "id";
      id: Identifier;
      idColumn: Column;
      order?: Order;
      schema: Schema;
      query: Query;
      complex?: undefined;
      opaque?: Opaque;
    }
  | {
      option?: "query";
      id?: undefined;
      idColumn?: undefined;
      order?: Order;
      schema: Schema;
      query?: undefined;
      complex?: undefined;
      opaque?: Opaque;
    }
  | {
      option?: "query";
      id?: undefined;
      idColumn?: undefined;
      order?: Order;
      schema: Schema;
      query: Query;
      complex?: undefined;
      opaque?: Opaque;
    }
  | {
      option?: "complex";
      id?: undefined;
      idColumn?: undefined;
      order?: undefined;
      schema: Schema;
      query?: undefined;
      complex: Complex;
      opaque?: Opaque;
    }
)): Promise<Return> {
  const multiple = _isTArray(schema);
  const title = _formatItem(getTableName(table), multiple);

  const values = await database(async (drizzle) => {
    if (complex !== undefined) {
      return (await complex(drizzle)) as Data extends object
        ? Data | undefined
        : Data;
    } else if (query !== undefined) {
      if (id !== undefined) {
        return await drizzle
          .select()
          .from(table as PgTableWithColumns<TableConfig>)
          .where(and(eq(idColumn!, id), query))
          .orderBy(order ?? desc(idColumn!));
      } else {
        if (order)
          return await drizzle
            .select()
            .from(table as PgTableWithColumns<TableConfig>)
            .where(query)
            .orderBy(order);
        else
          return await drizzle
            .select()
            .from(table as PgTableWithColumns<TableConfig>)
            .where(query);
      }
    } else {
      if (id !== undefined) {
        return await drizzle
          .select()
          .from(table as PgTableWithColumns<TableConfig>)
          .where(eq(idColumn!, id))
          .orderBy(order ?? desc(idColumn!));
      } else {
        if (order)
          return await drizzle
            .select()
            .from(table as PgTableWithColumns<TableConfig>)
            .orderBy(order);
        else
          return await drizzle
            .select()
            .from(table as PgTableWithColumns<TableConfig>);
      }
    }
  }, `query ${title}`);

  if (
    typeof values === "object" &&
    !Array.isArray(values) &&
    values !== null &&
    Object.hasOwn(values, "code") &&
    Object.hasOwn(values, "response")
  )
    return values as Return;

  if (
    !multiple &&
    ((Array.isArray(values) && values.length !== 1) || values === undefined)
  )
    if (opaque) return undefined as Return;
    else return error(404, `${title} not found`) as Return;

  let value = multiple
    ? Value.Convert(schema, values)
    : Value.Convert(schema, Array.isArray(values) ? values[0] : values);

  try {
    value = Value.Encode(schema, value);
  } catch (e) {
    console.warn(
      `an error occurred while encoding ${title}`,
      value,
      Array.from(Value.Errors(schema, value))
    );
  }

  if (!Value.Check(schema, value)) {
    console.error(
      `an error occurred while parsing ${title}`,
      value,
      Array.from(Value.Errors(schema, value))
    );

    if (opaque) return undefined as Return;
    else return error(500, `couldn't retrieve ${title}`) as Return;
  }

  const cast = Value.Cast(schema, Value.Clean(schema, value));

  return cast as Return;
}
