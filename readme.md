# drizzle-elysia-query

A helper package for [elysia](https://elysiajs.com/) and [drizzle-orm](https://drizzle-orm.js.org/) that provides a function to query the database and parse/transform the result according to the provided [TypeBox](https://github.com/sinclairzx81/typebox) schema.

## Usage

Initialize your database connection (for example to postgres)

```ts
import { databaseInitialize } from "drizzle-elysia-query";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: "postgres://postgres:postgres@localhost:5432/postgres",
});

databaseInitialize(() => drizzle(pool, { schema }));
```

### `database()` helper

Query your database with proper error handling!

```ts
import { database } from "drizzle-elysia-query";
import { Type } from "@sinclair/typebox";

const api = new Elysia().put(
  "/",
  async ({ body }) => {
    const insert = await database(async (drizzle) => {
      const insert = await drizzle.insert(users).values(body);

      if (insert.rowCount !== 1) throw new Error();
    }, "insert user");
    insert satisfies
      | void
      | ElysiaCustomStatusResponse<500, "couldn't insert user", 500>
      | ElysiaCustomStatusResponse<503, "database is not ready", 503>;

    if (insert)
      return insert satisfies
        | ElysiaCustomStatusResponse<500, "couldn't insert user", 500>
        | ElysiaCustomStatusResponse<503, "database is not ready", 503>;
  },
  {
    body: Type.Object({
      name: Type.String(),
    }),
  }
);
```

<br>

Even with transactions!

```ts
import { database } from "drizzle-elysia-query";
import { Type } from "@sinclair/typebox";

const User = Type.Object({
  id: Type.Integer(),
  name: Type.String(),
});

const api = new Elysia().patch(
  "/",
  async ({ body, params }) => {
    const update = await database(
      async (drizzle) =>
        await drizzle.transaction(async (drizzle) => {
          const update = await drizzle
            .update(users)
            .set(name)
            .where(eq(id, body.id));

          if (!sendEmail()) {
            drizzle.rollback();
            return error(500, "couldn't send email");
          }

          return "success";
        }),
      "update user"
    );
    if (update !== "success")
      return update satisfies
        | ElysiaCustomStatusResponse<500, "couldn't send email", 500>
        | ElysiaCustomStatusResponse<500, "couldn't insert user", 500>
        | ElysiaCustomStatusResponse<503, "database is not ready", 503>;
  },
  {
    params: Type.Object({
      id: Type.Integer(),
    }),
    body: Type.Object({
      name: Type.String(),
    }),
  }
);
```

### `query()` helper

Simple queries to your database can be done by using the helper entirely.<br>
The query helper will automatically resolve if your TypeBox Schema is an array or not and adjust accordingly.

```ts
export const queryUsers = query({ 
  table: users, 
  schema: Type.Array(User),
  order: desc(users.id), // optional 
});

const users = await queryUsers();
if (!Value.Check(Type.Array(User), users))
  return users satisfies
    | ElysiaCustomStatusResponse<500, "couldn't retrieve users", 500>
    | ElysiaCustomStatusResponse<500, "couldn't query users", 500>
    | ElysiaCustomStatusResponse<503, "database is not ready", 503>;
```

```ts
export const queryUser = (id: TUser["id"]) =>
  query({
    id,
    idColumn: users.id,
    table: users,
    schema: User,
  });

const users = await queryUser(1);
if (!Value.Check(User, users))
  return users satisfies
    | ElysiaCustomStatusResponse<404, "user not found", 404>
    | ElysiaCustomStatusResponse<500, "couldn't retrieve user", 500>
    | ElysiaCustomStatusResponse<500, "couldn't query user", 500>
    | ElysiaCustomStatusResponse<503, "database is not ready", 503>;
```

```ts
export const queryEventApplicationsByUser = (user: TUser["id"]) =>
  query({
    table: event_applications,
    order:
      sql`${event_applications.created} DESC, ${event_applications.storno} DESC` as SQL<
        typeof event_applications
      >,
    schema: Type.Array(EventApplication),
    query: and(
      eq(event_applications.user, user),
      eq(event_applications.storno, null)
    ) as SQL<typeof event_applications>,
  });

const applications = await queryEventApplicationsByUser(1);
if (!Value.Check(Type.Array(EventApplication), applications))
  return applications satisfies
    | ElysiaCustomStatusResponse<500, "couldn't retrieve event_applications", 500>
    | ElysiaCustomStatusResponse<500, "couldn't query event_applications", 500>
    | ElysiaCustomStatusResponse<503, "database is not ready", 503>;
```

<br>

Complex queries can be done using the `complex` option, enabling infinite possibilities! <br>
Note that your specified TypeBox Schema will be type checked against the result of the query from drizzle-orm 💡.

```ts
export const queryUsers = (ids: TUser["id"][]) =>
  query({
    table: users,
    schema: Type.Array(UserWithProfile),
    complex: async (drizzle) =>
      await drizzle.query.users.findMany({
        where: (users, { inArray }) => inArray(users.id, ids),
        orderBy: (users, { asc }) => asc(users.id),
        with: {
          profile: true,
        },
      }),
  });

const users = await queryUsers([1, 2, 3]);
if (!Value.Check(Type.Array(UserWithProfile), users))
  return users satisfies
    | ElysiaCustomStatusResponse<500, "couldn't retrieve users", 500>
    | ElysiaCustomStatusResponse<500, "couldn't query users", 500>
    | ElysiaCustomStatusResponse<503, "database is not ready", 503>;
```

<br>

Have simple side queries and don't want to have a complex error returned to you?<br>
Using any previous option, you can opt out of full elysia errors anytime by specifying the `opaque` option.

```ts
export const queryUsers = query({ 
  table: users, 
  schema: Type.Array(User), 
  opaque: true 
});

const users = await queryUsers();
users statisfies Static<User>[] | undefined;
```
