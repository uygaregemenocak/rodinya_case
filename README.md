# Media Library API

Backend case for Rodinya. A REST API where users can register, upload JPEG images and share them with other users.

Built with NestJS, MongoDB (Mongoose), JWT (access + refresh tokens) and Swagger.

Swagger UI is at `http://localhost:3000/docs` once the app is running.

## Running the project

You need Node.js 22 or newer.

```bash
npm install
cp .env.example .env   # then fill in MONGO_URI and the secrets
npm run start:dev
```

If you don't have a MongoDB Atlas cluster, you can run everything with Docker instead:

```bash
docker compose up --build
```

### Environment variables

| Name | Default | Description |
| --- | --- | --- |
| `MONGO_URI` | | MongoDB connection string |
| `JWT_ACCESS_SECRET` | | Secret for access tokens (min 32 chars) |
| `JWT_REFRESH_SECRET` | | Secret for refresh tokens (min 32 chars) |
| `UPLOAD_DIR` | `./uploads` | Where the files are saved |
| `MAX_FILE_SIZE` | `5242880` | Max upload size in bytes (5MB) |
| `PORT` | `3000` | |
| `STORAGE_SIGNING_SECRET` | | Secret for signing the presigned urls |
| `PRESIGNED_URL_TTL` | `300` | How long a presigned url works, in seconds |
| `PUBLIC_BASE_URL` | `http://localhost:PORT` | Base url used in presigned urls |
| `JWT_ACCESS_TTL` | `900` | Access token lifetime in seconds |
| `JWT_REFRESH_TTL` | `604800` | Refresh token lifetime in seconds |

The env is validated on startup, so the app won't start if something is missing.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Register |
| POST | `/auth/login` | Login |
| POST | `/auth/refresh` | Get new tokens with a refresh token |
| POST | `/auth/logout` | Revoke a refresh token |
| GET | `/users/me` | Current user |
| POST | `/media/upload` | Upload a JPEG (`multipart/form-data`, field name `file`) |
| GET | `/media/my` | My uploads (`?page=1&limit=20`) |
| GET | `/media/shared` | Images other users shared with me |
| GET | `/media/:id` | Image details + presigned urls |
| GET | `/media/:id/download` | Download the image through the API |
| DELETE | `/media/:id` | Delete an image |
| GET | `/media/:id/permissions` | Who can view the image |
| POST | `/media/:id/permissions` | Give or remove access: `{ "userId": "...", "action": "add" \| "remove" }` |
| GET | `/health` | Checks the database and the upload folder |

All `/media` and `/users` endpoints need an `Authorization: Bearer <accessToken>` header.

Status codes: `401` when the token is missing or invalid, `403` when you don't have access to the image, `404` when it doesn't exist, `413` if the file is bigger than 5MB, and `415` if it's not a JPEG.

### Example

```bash
# login
curl -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"x@y.com","password":"Passw0rd!"}'

# upload
curl -X POST http://localhost:3000/media/upload -H 'Authorization: Bearer <TOKEN>' \
  -F 'file=@/path/to/image.jpg'

# download
curl http://localhost:3000/media/<MEDIA_ID>/download -H 'Authorization: Bearer <TOKEN>' -OJ

# share with another user
curl -X POST http://localhost:3000/media/<MEDIA_ID>/permissions -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' -d '{"userId":"<USER_ID>","action":"add"}'
```

Note: the upload example in the case document uses `image.png`. Since only JPEG is allowed, that request returns `415`.

## How it works

### File storage and presigned urls

I wanted the file storage to work like S3 rather than just reading and writing files from the controllers. There is an `ObjectStorage` abstract class with `putObject`, `getObject`, `headObject` and `deleteObject`, and `LocalObjectStorage` implements it on top of the `uploads/` folder. Files are saved as `uploads/media/<ownerId>/<mediaId>.jpg`. If this needed to run on real S3 later, only that one class would have to be replaced.

Images are given to the client with presigned urls, the same way S3 does it. When you call `GET /media/:id`, the API checks if you're allowed to see the image and returns a `url` and a `downloadUrl`:

```
/storage/media/<ownerId>/<mediaId>.jpg?X-Algorithm=HMAC-SHA256&X-User-Id=<userId>&X-Expires=1791383880&X-Signature=...
```

The signature is an HMAC-SHA256 of the path, the user the url was made for, the expiry time and the content-disposition. Changing any of them makes the url invalid (`403`). The url works without a token, so it can go straight into an `<img>` tag, and it expires after 5 minutes by default.

The `/storage/...` route is a controller with a guard, not a static folder. The guard checks two things on every request:

1. The signature and the expiry.
2. Whether the user in the url can still see the file. This uses the same rules as the API (`canAccessMedia`).

The second check is there because the case says users without permission can't access a file. My first version only checked the signature, so if the owner removed someone's access, the urls that person already had kept working until they expired. Now removing access works right away, for the API and for urls that were already given out. Real S3 works the same way: a presigned url is checked against the current permissions of whoever created it.

The storage module doesn't know anything about media. It has a small `BucketPolicies` registry, the media module registers the read rule for the `media` bucket, and a bucket without a rule can't be read at all.

`GET /media/:id/download` is also there as the case asked. It checks the token and permissions on every request and streams the file.

### Authentication

- Passwords are hashed with argon2.
- The access token is short lived (15 min) and checked by a global guard, so every route needs a token unless it has `@Public()`.
- The refresh token is signed with a different secret. Each login creates a session in the `sessions` collection, which stores a hash of the current refresh token. Every refresh gives you a new refresh token and the old one stops working. If an old refresh token is used again, the whole session is revoked, because that probably means the token was stolen.
- Login and register are limited to 10 requests per minute.
- If the email doesn't exist, login still runs a password hash check, so the response time doesn't tell you whether an email is registered.

### Permissions

The permission check is done in `MediaAccessGuard`. It loads the media once and puts it on the request, so the controller doesn't need to query it again.

| | View / download | Delete | Manage permissions |
| --- | --- | --- | --- |
| Owner | yes | yes | yes |
| User in `allowedUserIds` | yes | no | no |
| Admin | yes | yes | no |
| Others | 403 | 403 | 403 |

The case only defines `role` in the user model, so I decided admins can view and delete any image but can't change who it's shared with.

Adding and removing permissions uses `$addToSet` and `$pull`, so two requests at the same time can't overwrite each other.

### Uploads

- The JWT guard runs before the file is read, so requests without a token never write anything to disk.
- The file streams straight to disk through a custom multer storage engine. Nothing is kept in memory.
- The `Content-Type` sent by the client is checked first, but the real check is on the first bytes of the file (`FF D8 FF`). A PNG renamed to `.jpg` is rejected.
- Multer stops the upload as soon as it goes over `MAX_FILE_SIZE` (5MB by default) and returns `413`, so a big file is never fully received.
- Files are written to a temp file and renamed when complete, so a half uploaded file is never visible.
- If saving to the database fails, the file is deleted. When deleting media, the db record is removed first and then the file.

### Performance

- Uploads and downloads are streamed, so memory use doesn't depend on file size.
- The presigned url permission check is two lookups by `_id` (the media and the user), run in parallel. That's the cost of making access removal work right away, and I think it's the right trade-off for this case.
- Presigned url expiry is rounded up to the next minute, so the same image gets the same url for a while. The browser keeps a copy and only asks if it's still allowed (`Cache-Control: private, no-cache`), which gives a small `304` with no body when nothing changed.
- Downloads support `ETag` / `304 Not Modified` and `Range` requests.
- Indexes on `{ ownerId, createdAt, _id }` and `{ allowedUserIds, createdAt, _id }` for the list endpoints. They match the sort order exactly, so MongoDB reads the results in order from the index instead of sorting them in memory. There's also a unique index on email and a TTL index on sessions.
- Queries use `.lean()`, and the list endpoint runs the find and the count in parallel.

## Tests

```bash
npm test           # unit tests
npm run test:e2e   # e2e tests, uses mongodb-memory-server so no real db is needed
npm run lint
```

The e2e tests start the whole app and cover register/login/refresh, uploads (valid, wrong type, too big), the permission rules for each type of user, presigned urls (valid, changed, expired, deleted file, access removed) and downloads.

There is also a GitHub Actions workflow that runs lint, build and tests.

## Project structure

```
src/
  auth/        register, login, refresh, logout, sessions
  users/       user model, /users/me
  media/       upload, list, download, permissions, access guard
  storage/     ObjectStorage, local disk implementation, presigned urls
  health/      /health
  common/      global jwt guard, decorators
  config/      env validation
test/          e2e tests
```

## Notes

- `filePath` in the media collection stores the path inside the bucket (`<ownerId>/<mediaId>.jpg`) and not the full path on disk, so the data doesn't depend on where the app runs.
- I added a few things that weren't in the case: logout, the shared-with-me list, pagination, rate limiting, Docker and CI.

## What I would add next

- A real S3 implementation of `ObjectStorage`.
- A cleanup job for files without a db record (can happen if the app crashes between writing the file and saving the record).
- Cursor based pagination instead of skip/limit.
- A separate permissions collection if images were shared with a lot of users.
- Thumbnails and removing EXIF data from uploaded images.
