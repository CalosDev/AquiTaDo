ALTER TABLE "users"
ADD COLUMN "googleSubject" VARCHAR(191);

CREATE UNIQUE INDEX "users_googleSubject_key"
ON "users"("googleSubject");
