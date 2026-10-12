# Deployment status

The web deployment is being verified. The confirmed production URL and checks will be recorded here before publishing the completed repository.

## Service split

| Service | Hosting |
| --- | --- |
| Next.js web interface and short API requests | Vercel |
| Authentication, data, vectors, and private files | Supabase |
| Gemini generation and embeddings | Server-only API credentials |
| FFmpeg video worker and speech API | Separate long-running host required |

Worker flags are disabled on Vercel until a separately hosted worker and speech service are available. Uploading an MP4 and adding a permitted timed transcript works without those flags. No local speech endpoint or privileged worker key is copied into the Vercel web environment.

Documents use a 4 MB limit on Vercel. Videos use signed direct Supabase uploads and retain the 50 MB storage limit.

Supabase Auth email confirmation requires the production Site URL and redirect allowlist to be set to the deployed origin. Existing password sign-in does not need an email redirect.
