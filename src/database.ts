import { inspect } from "bun";
import { drizzle as _drizzle } from "drizzle-orm/node-postgres";
import { error as _error } from "elysia";
import { ElysiaCustomStatusResponse } from "elysia/error";

export type Database = Awaited<ReturnType<typeof _drizzle>>;

let _database: (() => Database) | undefined = undefined;

export const databaseInitialize = (drizzle: () => Database) =>
  (_database = drizzle);

export const database = async <Result, Operation extends Readonly<string>>(
  query: (drizzle: Database) => Promise<Result>,
  operation: Operation
): Promise<
  | Result
  | ElysiaCustomStatusResponse<500, `couldn't ${typeof operation}`, 500>
  | ElysiaCustomStatusResponse<503, `database is not ready`, 503>
> => {
  if (_database === undefined) {
    console.error("databaseInitialize() has not been called yet!");
    return _error(503, "database is not ready");
  }

  try {
    return await query(_database());
  } catch (e) {
    console.error(`an error occurred while ${operation}`, inspect(e));
    return _error(500, `couldn't ${operation}`);
  }
};
