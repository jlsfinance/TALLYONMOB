# Syncora SEO workflow

OpenSEO holds keyword research, crawl audits and Search Console reporting. Use the India / English project for tallyonmob.vercel.app. Compare actual Search Console impressions and clicks after the Google account is linked. Keyword-tool volumes are estimates. Related variants can share a volume.

## Editorial calendar

| Week | Reader question | Destination |
| --- | --- | --- |
| 1 | What can I see from TallyPrime on my phone? | Improve the product overview |
| 1 | How do I connect my Windows accounting PC? | Improve the setup guide |
| 1 | Why is my company missing after syncing? | Improve the troubleshooting guide |
| 1 | How do I check one voucher after a sync? | Draft ready for review |
| 2 | How do I export a customer ledger PDF? | Improve the ledger guide |
| 2 | What should I check before sharing a month-end ledger? | Draft ready for review |
| 2 | What does the date range change in a ledger statement? | Add an example to the ledger guide |
| 2 | How does my accountant verify a client’s vouchers? | Improve the accountant guide |
| 3 | What happens to dashboard data while the PC is offline? | Add a verified answer to the troubleshooting guide |
| 3 | How can I tell that an edited voucher is current? | Add a verified example to the voucher draft |
| 3 | What belongs in a support report for a missing voucher? | Add a checklist to the troubleshooting guide |
| 3 | How can I compare my customer’s closing balance? | Add a worked example to the month-end draft |
| 4 | What should I check before reviewing bank reconciliation? | Write a checklist after verifying the workflow |
| 4 | Which accounting tasks should I do in TallyPrime and which can I review on mobile? | Extend the product overview with a workflow comparison |
| 4 | What happens at the end of the Syncora trial? | Confirm policy and expand pricing |

## Draft, review and publish

Run these commands from tally-web-dashboard.

1. Use `npm run seo:content -- list` to list existing drafts. Edit the JSON in `content/seo/drafts/`. For an AI first draft, use `npm run seo:content -- draft my-topic "Audience, question, verified detail and expected next step"`. It uses the existing Gemini client and requires a local `GEMINI_API_KEY` or `GOOGLE_API_KEY`. Keep the brief limited to public product facts.
2. Review the complete draft with `npm run seo:content -- review my-topic`. Check the current product workflow, any figures, names and related links. The output ends with a revision hash.
3. Run `npm run seo:content -- approve my-topic REVISION_HASH` after approval. The approved snapshot is written to `content/seo/approved/`. If the draft changes, review the new revision before approving it. Deploying a build with an older approved snapshot continues serving that approved text.
4. Run `npm run build:web` and check the approved article, Resources hub and sitemap under `dist/`. Deploy through the existing Vercel project after checking the staged output. Vercel builds the resources as HTML with no client script. Only approved article snapshots become public pages.
5. After deployment, check the article on the canonical domain. Submit the live sitemap in Search Console and use URL Inspection for important pages when an authorized Google account is available.

WordPress and Webflow publishing are outside this Vercel workflow.


## Scheduled cloud publishing

The GitHub Actions workflow runs on the 1st and 16th at 08:53 India time. It plans against the India calendar month, carries unused first-batch capacity into the second batch, and counts previously published automatic articles when retried. Monthly targets of 15, 30 and 50 give planned splits of 7 + 8, 15 + 15 and 25 + 25. The target is a ceiling. A rejected article leaves its slot open.

The workflow starts with content/seo/briefs.json. When more topics are needed, Gemini proposes distinct questions grounded in the project's public guide summaries and verified examples. Each candidate goes through generation, format validation and a separate automated review. When a verified brief or its linked page summary changes, the next scheduled run can revise the article at its existing URL. Manually approved articles remain under manual review. Edit the underlying briefs when product steps or facts change.

1. Put the tested web source, automation scripts and briefs on a maintained Syncora release branch compatible with the live Vercel project. Keep this branch current with the live application. The workflow file itself must also be on the repository's default branch for GitHub's schedule to run. Configure Vercel so commits from the automation branch do not independently promote to production.
2. In GitHub Actions repository variables, set SEO_RELEASE_REF, VERCEL_ORG_ID, and VERCEL_PROJECT_ID. Get the two Vercel identifiers from the existing linked project's project.json. Optionally set SEO_MONTHLY_ARTICLES to 15, 30 or 50.
3. Set repository Actions secrets GEMINI_API_KEY and VERCEL_TOKEN in GitHub, with access to the correct Vercel scope and project. The GitHub Actions token needs write access to the release branch so it can persist reviewed article snapshots. Use normal repository branch permissions and the repository's trusted release branch.
4. From Actions, run **Syncora SEO publishing** with **plan_only** selected. Check that the expected candidates are listed. Turn off **plan_only** for the first cloud generation and staged deployment. Set SEO_AUTOMATION_ENABLED to true after the cloud check succeeds.
5. The publishing run builds static HTML and the sitemap, persists reviewed articles, verifies the staged Vercel revision and sitemap, then promotes that deployment and checks the canonical domain. Re-running can promote saved snapshots if an earlier deployment did not become live. Setting SEO_AUTOMATION_ENABLED to false pauses the schedule.

The automated review checks grounded product claims and practical detail. Human review remains available through the existing manual draft commands. A site-wide application change, a Search Console submission, or a guarantee of search indexing is outside this article workflow.

