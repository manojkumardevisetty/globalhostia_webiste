# Ticket spam filter

Closes or flags WHMCS support tickets from people who are **not customers**: vendor pitches (SEO, web design, app
development, marketing, link building, guest posts, lead lists), scams (fake invoices, "your domain will expire" notices,
crypto and investment offers, account-verification links) and junk. Admin: **AI assistant > Ticket spam**
(`/admin/assistant/spam`).

Code: `lib/ai/spam-core.ts` (rules, decisions, the flow; pure), `lib/ai/spam.ts` (database, Haiku call, settings, weekly
summary). Tests: `tests/ai-spam.test.mts` (unit), `tests/ai-spam-int.test.mts` (against `tests/mock-whmcs.mjs`).

## Defaults after deploy

| Setting | Default |
| --- | --- |
| Filter | **On** |
| Mode | **Auto-close** at confidence **>= 0.95** (non-clients only) |
| Flag | confidence **0.60 to 0.95**: internal note and review queue; the ticket stays open |
| Below 0.60 or "legit" | nothing happens |
| Status on close | `Closed` (pick a custom status such as `Spam` in the admin page) |
| Spam department | none (the ticket keeps its department) |
| Auto-block repeat senders | on (second confirmed spam from the same email, or the same company domain) |
| Block in WHMCS Spam Control | **off** |
| Weekly summary email | on (only sent when something was closed or waits for review) |
| Tickets per run / age | 6 AI checks per run, activity from the last 72 hours |

Switch to **Flag only** in the admin page to review everything by hand first.

## When it runs

`checkTickets()` in `lib/support-notify.ts` screens awaiting tickets (status Open or Customer-Reply) **before** it sends
the owner's ticket email and before the AI ticket assistant (`lib/ai/tickets.ts`) drafts or auto-replies. A ticket closed
as spam is therefore not emailed to the owner and never answered. `checkTickets()` is called by:

- the WHMCS cron hook (`AfterCronJob` → `/api/reminders/webhook` event `tick`, every WHMCS cron run, usually 5 minutes);
- the client-area ping (`/api/support/ping`), portal ticket open and reply;
- Admin dashboard and Support page visits, and "Check waiting tickets now" on the spam page;
- the daily Vercel cron `/api/cron/sync` (this run also sends the weekly summary).

Every ticket activity (ticket id + last reply time) is screened once (claimed in `ai_spam_decisions`). A new reply from
the sender is screened again.

## Order of checks

1. Last message from staff: skipped.
2. **Client**: the ticket belongs to a client account, or the sender's email is a client or a user on a client account
   (`GetClients`, `GetUsers`): skipped entirely, no AI call. If WHMCS cannot answer, the ticket is skipped too.
3. Sender on a GlobalHostia domain or on the allowlist: skipped.
4. Rules that decide without an AI call: sender on the blocklist (confidence 1), owner spam phrase (0.96), link to or
   sender on a lookalike of a GlobalHostia domain such as `gl0balhostia-billing.com` (scam, 0.97).
5. Claude Haiku: subject, sender, link count, rule hints and the message cut to 2,000 characters; strict JSON
   `{label: legit|solicitation|scam|junk, confidence 0-1, reason}`. Counts against the AI monthly and daily budget
   (AI settings). An invalid answer or an API error does **nothing**.
6. No AI key or budget reached: strong rule hints can **flag** (0.70), never close.

A ticket a staff member already replied to is flagged instead of closed. Nothing is ever deleted and no reply is ever
sent to the sender. Flagged and closed tickets are never drafted or answered by the AI ticket assistant.

## Owner steps

1. **WHMCS API role**: the API credential's role (WHMCS: Configuration > System Settings > Manage API Credentials > API
   Roles) must allow `GetTickets`, `GetTicket`, `UpdateTicket`, `AddTicketNote`, `GetClients`, `GetUsers` and
   `GetSupportDepartments`, `GetSupportStatuses` (for the pickers). `BlockTicketSender` only if you turn on "Also block in
   WHMCS Spam Control". A missing permission shows up as "close failed" in the log; nothing else breaks.
2. **Optional Spam department**: WHMCS Configuration > System Settings > Support Departments > Add New Department
   ("Spam", hidden from clients, no email piping), then choose it in the admin page.
3. **Optional Spam status** (recommended if WHMCS ticket feedback emails are on: closing a ticket can send the sender a
   feedback request): Configuration > System Settings > Ticket Statuses > add "Spam" with "Include in Active Tickets" and
   "Include in Awaiting Reply" unticked, then pick it as "Status on auto-close".
4. **WHMCS Spam Control** (stops emails from opening tickets at all; it does not cover the web ticket form):
   Configuration > System Settings > Spam Control, add the email or a phrase; or open the ticket in WHMCS and click
   **Block Sender**. The API has `BlockTicketSender` (WHMCS 7.10+), which the filter can call for auto-blocked senders
   (setting off by default). The API has no call to read or remove Spam Control entries, so undo them in WHMCS.

## Restore

"Not spam, restore" reopens a closed ticket (status Open, back to its old department), adds a note, removes the sender
from the blocklists (their email, and the domain entry if it was added automatically) and puts the email on the
allowlist, so their next tickets are not screened. "Spam, close it" on a flagged ticket closes it the same way as the
automatic close and counts towards auto-blocking.

## Data

`ai_spam_decisions` (one row per screened ticket activity), `ai_spam_senders` (automatic and admin block / allow
entries), settings key `ai_spam` (configuration) and `ai_spam_state` (weekly summary time). Created by db-setup patch
`040-ticket-spam`. AI cost is logged in `ai_usage` (surface tickets, detail `spam`).
