import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import PublicLayout, { Section, neu, CONTACT } from './PublicLayout';

export default function TermsPage() {
  return (
    <PublicLayout
      title="Terms of Service"
      intro="The agreement between your business and ours. Written to be read, not to be skipped."
      updated="22 August 2026"
    >
      <div className="p-4 flex gap-3 rounded-xl border border-amber-300" style={{ background: '#FEF6E7' }}>
        <AlertTriangle size={17} className="text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-900">
          <strong>This is a working draft.</strong> It states our intentions plainly, but it has
          not been reviewed by a lawyer and is not yet a settled contract. Have it checked before
          relying on it.
        </p>
      </div>

      <Section title="The agreement">
        <p>
          These terms apply between MauzoHalisi and the business that opens an account. By signing
          up, whoever does so confirms they are entitled to accept these terms for that business.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You are responsible for what happens under your account, including anything done by staff
          you add. Give each person their own login rather than sharing one — it is the only way
          the reports can tell you who sold what, and the only way to remove one person's access
          without disrupting everyone.
        </p>
        <p>
          Keep passwords private, and tell us promptly if you think an account has been reached by
          someone who should not have it.
        </p>
      </Section>

      <Section title="Trial, plans and payment">
        <p>
          New accounts start with a 30-day trial. No card is required and it does not roll into a
          paid plan by itself — if you do nothing, access simply ends.
        </p>
        <p>
          Paid plans are billed in advance for the period chosen, in Tanzanian shillings. Fees are
          not refundable for a period already started, though you may cancel at any time and keep
          access until that period ends.
        </p>
        <p>
          We may change prices, but not on you mid-period: existing subscribers get at least 30
          days' notice before a change affects them.
        </p>
      </Section>

      <Section title="Your data is yours">
        <p>
          Everything you put in — products, sales, customers, invoices — belongs to your business,
          not to us. We claim no ownership and will not use it for anything beyond running the
          service for you.
        </p>
        <p>
          You can export it to CSV whenever you like. If you close your account, you may ask for a
          full export within 90 days and we will provide it. See the{' '}
          <Link to="/privacy" className="font-semibold text-stone-900 underline underline-offset-2">
            Privacy Policy
          </Link>{' '}
          for how it is handled.
        </p>
      </Section>

      <Section title="Fair use">
        <p>Do not use the service to break the law, to trade in goods you are not entitled to
        sell, or to store data you had no right to collect.</p>
        <p>Do not attempt to reach another business's data, probe the system for weaknesses
        without asking us first, resell access, or automate traffic in a way that degrades the
        service for others.</p>
        <p>If you find a security flaw, please tell us at{' '}
          <a href={`mailto:${CONTACT.support}`} className="font-semibold text-stone-900 underline underline-offset-2">
            {CONTACT.support}
          </a>{' '}
          before telling anyone else. We will not pursue anyone who reports a genuine issue
          responsibly.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          We work to keep the service running at all times and will schedule maintenance outside
          normal trading hours where we can. We do not promise uninterrupted availability, and
          outages caused by the internet, power, or a provider we depend on are outside our
          control.
        </p>
        <p>
          Because a till cannot wait for a network, keep a way to record sales on paper for the
          rare occasions the service is unreachable.
        </p>
      </Section>

      <Section title="What we are responsible for">
        <p>
          We take accuracy seriously — it is the point of the product. But the figures the service
          shows depend on what is entered into it, and it is not a substitute for your own
          bookkeeping or professional accounting and tax advice.
        </p>
        <p>
          We are not liable for indirect or consequential losses, including lost profit or lost
          business. Where we are found liable, our total liability is limited to the fees you paid
          us in the twelve months before the claim. Nothing here limits liability that cannot
          lawfully be limited.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          You may close your account at any time from inside the application or by writing to us.
        </p>
        <p>
          We may suspend or close an account that breaches these terms, that goes unpaid after
          reminders, or where we are required to by law. Except in serious cases we will warn you
          first and give you a chance to put it right, and we will always give you the opportunity
          to export your data.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          These terms may change as the service does. Material changes are notified to account
          holders by email at least 30 days beforehand. Continuing to use the service after that
          means accepting the new terms; if you would rather not, you may cancel.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of the United Republic of Tanzania, and the courts
          of Tanzania have jurisdiction over any dispute. We would much rather settle a
          disagreement by talking to you first — write to us and we will try.
        </p>
      </Section>

      <div className="p-5" style={neu.inset}>
        <p className="text-sm text-stone-700">
          Anything here unclear?{' '}
          <a href={`mailto:${CONTACT.email}`} className="font-semibold text-stone-900 underline underline-offset-2">
            {CONTACT.email}
          </a>
        </p>
      </div>
    </PublicLayout>
  );
}
