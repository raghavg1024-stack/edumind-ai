# Deployment status

The web application was deployed and checked on 12 October 2026.

- **Live app:** https://edumind-ai-xi.vercel.app
- **Source repository:** https://github.com/raghavg1024-stack/edumind-ai (public)
- **Vercel project:** https://vercel.com/mugiwara9/edumind-ai
- **Verification:** [deployment-verification.json](deployment-verification.json)

The deployed homepage, authenticated route boundaries, text ingestion, sample-video byte-range delivery, mobile bottom navigation, laptop sidebar, Galaxy, and demo tutor passed checks. Browser page errors: none. Local lint, all 15 tests, the production build, and GitHub Actions quality checks also passed. This report does not claim that a hosted automatic video worker is running.

## Repository connection

The source is pushed to GitHub, and direct Vercel CLI deployment succeeded. Automatic Git-triggered deployments are not connected: Vercel's GitHub account/app integration needs authorization for this repository. Connecting was retried after making the repository public and still failed.

To enable them, grant the [Vercel GitHub App](https://github.com/apps/vercel) access specifically to `edumind-ai`, then connect the repository in Vercel project settings. Keep other private repositories excluded unless you want to share them with Vercel.

Until connected, deploy changes from a signed-in machine using `vercel --prod --yes` in the project root. Adding or changing `NEXT_PUBLIC_` settings requires a new build/deployment.

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
