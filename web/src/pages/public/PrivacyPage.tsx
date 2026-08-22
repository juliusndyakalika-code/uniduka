import { AlertTriangle } from 'lucide-react';
import PublicLayout, { Section, neu, CONTACT } from './PublicLayout';

export default function PrivacyPage() {
  return (
    <PublicLayout
      title="Privacy Policy"
      intro="What we collect, why we hold it, and what you can ask us to do with it."
      updated="22 August 2026"
    >
      {/* Removing this banner is a decision for a lawyer, not a developer. */}
      <div className="p-4 flex gap-3 rounded-xl border border-amber-300" style={{ background: '#FEF6E7' }}>
        <AlertTriangle size={17} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          <strong>This is a working draft.</strong> It describes honestly how the system behaves
          today, but it has not been reviewed by a lawyer. Have it checked against the Personal
          Data Protection Act, 2022 before relying on it.
        </p>
      </div>

      <Section title="Who is responsible for what">
        <p>
          Two different relationships run through this service, and the difference matters.
        </p>
        <p>
          For <strong>your own account</strong> — your name, email, shop details and billing — we
          decide how that information is handled, and we are answerable for it.
        </p>
        <p>
          For <strong>the records you enter</strong> — your customers, their phone numbers, what
          they bought, what they owe — you decide. We hold and process that on your instruction.
          It is your data. We do not sell it, mine it, or use it to build anything of our own, and
          we do not look at it except when you ask us to help with a problem.
        </p>
      </Section>

      <Section title="What we collect">
        <p><strong className="text-stone-900">When you sign up</strong> — your name, email address,
        phone number, business name, and the shop details you enter such as address, TIN and VRN.</p>

        <p><strong className="text-stone-900">As you use it</strong> — the products, stock levels,
        sales, invoices, expenses and staff accounts you create. This is the substance of the
        service; without it there is nothing to show you.</p>

        <p><strong className="text-stone-900">About your customers, if you enter them</strong> —
        names, phone numbers, email addresses, delivery addresses, and their purchase and payment
        history with you. You choose what to record.</p>

        <p><strong className="text-stone-900">From your online store, if you open one</strong> —
        when a shopper places an order we collect the name, phone number and delivery address they
        type in, and what they ordered. That goes to you.</p>

        <p><strong className="text-stone-900">Technical records</strong> — sign-in times, the
        browser and device you use, and error logs. These exist to keep accounts secure and to
        work out what went wrong when something breaks.</p>
      </Section>

      <Section title="What we do not collect">
        <p>
          We do not take card numbers or mobile money PINs — the service does not process payments.
          When you record a sale as M-Pesa, you are noting that it happened, not moving money
          through us.
        </p>
        <p>
          We do not track you across other websites, and there are no advertising or analytics
          trackers in the application.
        </p>
      </Section>

      <Section title="What stays on your device">
        <p>
          Your browser keeps a sign-in token so you are not asked for a password on every page, your
          language choice, and — on a storefront — the shopping basket until the order is placed.
          Clearing your browser data removes all of it and signs you out.
        </p>
      </Section>

      <Section title="Who else touches it">
        <p>
          <strong className="text-stone-900">Our hosting provider.</strong> The application and
          database run on infrastructure we rent. They hold the data physically but do not use it.
        </p>
        <p>
          <strong className="text-stone-900">WhatsApp — but less than you might think.</strong> When
          you or a customer taps a WhatsApp button, it opens WhatsApp on that person's own phone
          with a message ready to send. We do not send anything ourselves and no data passes from us
          to WhatsApp. Once the message is sent, that conversation is between the two of you and
          governed by WhatsApp's own terms.
        </p>
        <p>
          We do not sell data to anyone, and we do not share it with anyone else unless the law
          requires it — in which case we will tell you, unless we are forbidden from doing so.
        </p>
      </Section>

      <Section title="How it is protected">
        <p>
          Traffic is encrypted in transit. Passwords are stored hashed, never in a readable form, so
          nobody at MauzoHalisi can see yours. Each shop's data is separated by account, and staff
          you add only reach what their role allows. Sessions expire after a period of inactivity.
        </p>
        <p>
          No system is perfectly safe, and we will not pretend otherwise. If a breach ever affects
          your data we will tell you what happened, what was exposed, and what we are doing.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          While your account is open, we keep your data so the service works — and because your
          sales history is a business record you may be required to retain.
        </p>
        <p>
          If you close your account, we delete your data within 90 days. Some records may be held
          longer where tax or accounting law requires it. Say the word and we will confirm exactly
          what remains and why.
        </p>
      </Section>

      <Section title="What you can ask for">
        <p>
          Ask us for a copy of what we hold about you, and we will provide it. Ask us to correct
          something wrong, and we will. Ask us to delete your account, and we will, subject to the
          retention above. Your sales and inventory can be exported to CSV from inside the
          application at any time, without asking us at all.
        </p>
        <p>
          Where your customers ask you for the same things about their data, you are the one who
          answers — and we will help you do it.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this policy changes in a way that matters, we will tell account holders by email
          rather than quietly editing the page. The date at the top always reflects the current
          version.
        </p>
      </Section>

      <div className="p-5" style={neu.inset}>
        <p className="text-sm text-stone-700">
          Questions about any of this, or want to make a request?{' '}
          <a href={`mailto:${CONTACT.email}`} className="font-semibold text-stone-900 underline underline-offset-2">
            {CONTACT.email}
          </a>
        </p>
      </div>
    </PublicLayout>
  );
}
