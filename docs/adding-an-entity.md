# Como adicionar uma entidade CRUD

Guia para uma entidade persistida com listagem, leitura, criação, atualização e exclusão na API. O backend é um monólito modular Express + TypeScript: um domínio fica em `src/modules/<dominio>/`, o SQL usa o driver `pg` e a entrada HTTP passa por Zod.

Este documento vale para código novo. Não descreve pagamento, fila, worker nem um fluxo que orquestre três ou mais módulos.

## O que copiar

Dois módulos já mostram o formato atual.

| Situação | Copiar |
| --- | --- |
| Catálogo da operação, escrito por administrador | `src/modules/professional-type/` e `migrations/007_professional_types.sql` |
| Recurso de uma conta, lido e escrito só pelo dono | `src/modules/pet/` |

`professional-type` valida body, params e query, lista colunas no SQL, traduz unicidade (`23505`) para 409 e apaga dentro de `withTransaction` com `FOR UPDATE`. `pet` autentica, confere o papel no controller e coloca `owner_id` em toda leitura e escrita.

`src/modules/catalog/category.controller.ts` é formato antigo: mensagem em inglês, checagem manual depois do Zod e rota sem `validateParams`. Código novo não segue esse arquivo.

## 1. Escolher o módulo

Se a entidade é um domínio novo, crie `src/modules/<dominio>/`. Se ela já pertence a um domínio existente, os arquivos novos ficam nessa pasta.

Arquivos de um CRUD HTTP:

```text
src/modules/<dominio>/
  <dominio>.routes.ts
  <dominio>.controller.ts
  <dominio>.schemas.ts
  <dominio>.service.ts
  <dominio>.types.ts
```

Código novo não volta para pastas `controllers/` ou `services/` na raiz de `src`. Outro módulo importa só o service público. Não importe `*.repo.ts`, query nem tabela de outro domínio.

`*.repo.ts` só entra quando o SQL misturado à regra atrapalha a leitura ou o teste. Um CRUD com poucas queries permanece no service, como `professional-type` e `pet`.

## 2. Criar a migration

O próximo arquivo é `migrations/019_<nome>.sql`, ou o prefixo inteiro seguinte ao maior que já existe. Há dois arquivos com prefixo `017`; não reutilize um número.

O runner em `src/scripts/migrate.ts` grava o checksum. Editar uma migration já aplicada faz o comando falhar. A mudança de schema é um arquivo novo.

Forma da tabela, no mesmo espírito de `professional_types`:

- `id uuid DEFAULT gen_random_uuid() NOT NULL` como chave primária
- `created_at` e `updated_at` em `timestamptz DEFAULT now() NOT NULL`
- `CHECK` para texto que não pode ficar em branco, por exemplo `btrim(name) <> ''`
- índice único quando o nome não pode repetir, em geral sobre `lower(btrim(name))`
- `FOREIGN KEY` com `ON DELETE` explícito (`RESTRICT` ou `CASCADE`), mais o índice da coluna que referencia

Nomes de tabela, coluna e constraint em inglês. Aplique com `npm run db:migrate` a partir da pasta `API`.

## 3. Tipos e schemas

`*.types.ts` descreve a linha e o input do service. `*.schemas.ts` descreve o que chega no HTTP.

- Mensagens visíveis ao usuário em pt-BR.
- Body de criação com limite de tamanho, `trim` e enum quando o conjunto de valores é fechado.
- Atualização parcial exige pelo menos um campo, como `updateProfessionalTypeSchema`.
- Id de rota em `z.uuid`.
- Query com `z.enum(['true', 'false'])` quando o filtro é uma string, como `include_inactive`.

Exporte o tipo inferido com `z.infer` quando o controller traduz o body para o input do service.

## 4. Rotas

Use `validate`, `validateParams` e `validateQuery` de `src/shared/http/validate.middleware.ts`. O middleware responde `400` com `{ success: false, message: 'Dados inválidos', errors: [{ field, message }] }` e substitui `req.body`, `req.params` ou `req.query` pelo valor já parseado.

Ordem da rota:

1. caminho fixo, como `/public`, antes de `/:id`
2. `authenticate` quando a rota exige sessão
3. `isAdmin` na escrita de catálogo da operação
4. validação de params, query e body
5. controller

Monte o router em `src/routes/index.ts`. O prefixo público fica `/api/v1/<recurso>`, no plural e em kebab-case, como `/api/v1/professional-types` e `/api/v1/pets`.

## 5. Controller

O controller autoriza, chama o service e mapeia o status. Não contém SQL nem regra de preço, status de booking ou unicidade.

Resposta de sucesso: `{ success: true, data }` com `201` na criação e `200` na leitura, atualização e exclusão. Exclusão sem corpo útil pode responder `{ success: true }`, como o tipo de profissional.

Ausência da linha vira `AppError` com `404`. O handler em `src/shared/http/error-handler.ts` devolve `{ message }` com o status do `AppError`. Mensagem nova de domínio em pt-BR.

Papel recusado no controller usa `403`, como em `pet.controller.ts` (`Apenas o tutor pode gerenciar pets da própria conta`). Catálogo de escrita continua com `authenticate` e `isAdmin` na rota. Não copie a mensagem em inglês desse middleware para um controller novo.

## 6. Service e SQL

SQL parametrizado (`$1`, `$2`, …). `SELECT` e `RETURNING` listam as colunas do tipo, como em `professional-type.service.ts`. O `WHERE` de um recurso de conta inclui o dono (`owner_id` ou o equivalente). Conferir o dono só no controller deixa a linha aberta para outro id.

Unicidade violada (`code === '23505'`) vira `AppError` `409` com texto pt-BR. Violação de chave estrangeira na exclusão (`23503`) vira conflito de uso, não `500`.

`withTransaction` de `src/shared/db/transaction.ts` entra quando a escrita toca mais de uma tabela, ou quando o fluxo lê, decide e apaga com risco de corrida. O modelo é `removeProfessionalType`: trava a linha com `FOR UPDATE`, confere vínculos e só então apaga. Não espalhe `BEGIN` solto.

Atualização parcial monta o `SET` só com os campos presentes e sempre grava `updated_at = NOW()`.

## 7. Acesso a dados

A entidade nova usa `pg`, via `getPool()` ou o client de `withTransaction`. Drizzle é a evolução escolhida para quando o SQL repetido ou as migrations de um domínio já doerem de fato. Criar uma entidade não é esse gatilho: não instale ORM, query builder nem um segundo runner de migration neste trabalho.

## Seed local

O seed em `src/scripts/seed-local.ts` só muda se a conta de demonstração precisar da entidade para o fluxo local. Caso contrário, a migration basta.

## Checklist

- [ ] A entidade cabe num domínio; outro módulo não importa repo, query nem tabela desta pasta
- [ ] Migration nova, com prefixo ainda não usado; nenhuma migration aplicada foi editada
- [ ] Constraints cobrem branco, unicidade e `ON DELETE`
- [ ] Zod na borda, com `validate` / `validateParams` / `validateQuery`; caminho fixo antes de `/:id`
- [ ] Controller sem SQL; sucesso em `{ success: true, data }`; `201` na criação
- [ ] Mensagens novas de domínio em pt-BR; papel recusado no controller em `403`
- [ ] Dono da linha no `WHERE` de toda leitura e escrita desse recurso
- [ ] Escrita multi-tabela, ou ler-decidir-apagar, dentro de `withTransaction`
- [ ] `npm run build` em `API/` verde
- [ ] Teste do fluxo incluído quando o plano da tarefa pedir; o build sozinho não cobre o comportamento
