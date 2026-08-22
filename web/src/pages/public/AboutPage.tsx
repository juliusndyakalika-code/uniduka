import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import PublicLayout, { Section, neu } from './PublicLayout';

const WHAT_IT_DOES = [
  ['Point of sale',   'Cash, M-Pesa, card or credit. Receipts print on the spot with your TIN and VRN.'],
  ['Stock that adds up', 'Every sale, restock and adjustment is recorded, so what the screen says is what is on the shelf.'],
  ['Invoices',        'Bill a customer now, deliver later, get paid on terms. Numbered without gaps.'],
  ['An online store', 'Share a link on WhatsApp and take orders. Payment on delivery or pickup.'],
  ['Reports',         'Revenue by day, week or month, profit per product, and who sold what.'],
];

export default function AboutPage() {
  return (
    <PublicLayout
      title="About MauzoHalisi"
      intro="Software for Tanzanian businesses that need to know exactly what they sold, what they hold, and what they made."
    >
      <Section title="Halisi means real">
        <p>
          Most business software promises to be clever. We would rather be accurate. A shopkeeper
          does not need a prediction about next quarter — they need to know whether the twelve
          crates in the store room are really twelve, and whether yesterday took more than the day
          before.
        </p>
        <p>
          That sounds simple until you try it. Stock counts drift. A sale gets recorded twice.
          Revenue lands on the wrong day because the software was built somewhere three hours
          behind. Those are the things that quietly cost money, and they are what we work on.
        </p>
      </Section>

      <Section title="Who it is for">
        <p>
          Eleven kinds of business, because a pharmacy tracking batch numbers and a bar running
          tabs are not the same job: retail shops, wholesale and distribution, grocery and
          supermarkets, pharmacies and clinics, restaurants and cafés, bars, salons and spas,
          repair workshops, and hotels and guesthouses.
        </p>
        <p>
          One shop or ten, one till or a counter full of them. You can run everything from a phone
          if that is what you have.
        </p>
      </Section>

      <Section title="What it does">
        <div className="grid gap-2.5 mt-1">
          {WHAT_IT_DOES.map(([title, desc]) => (
            <div key={title} className="p-4 flex gap-3" style={neu.card}>
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-stone-900">{title}</p>
                <p className="text-sm text-stone-500 mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Built here">
        <p>
          MauzoHalisi is built in Tanzania for businesses working in Tanzania. Prices in shillings,
          receipts that satisfy the taxman, M-Pesa and Airtel Money alongside cash, Kiswahili and
          English throughout, and a working day that starts at midnight where you are — not where a
          server happens to sit.
        </p>
      </Section>

      <div className="p-6 sm:p-7" style={neu.card}>
        <h2 className="text-lg font-bold text-stone-900">Try it on your own numbers</h2>
        <p className="text-sm text-stone-600 mt-1.5 max-w-lg">
          Thirty days free, no card. Put a week of real sales through it and see whether the totals
          match your own.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <Link to="/register"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors">
            Start free trial <ArrowRight size={14} />
          </Link>
          <Link to="/contact"
            className="inline-flex items-center px-5 py-2.5 rounded-xl text-sm font-semibold text-stone-700"
            style={neu.card}>
            Talk to us
          </Link>
        </div>
      </div>
    </PublicLayout>
  );
}
