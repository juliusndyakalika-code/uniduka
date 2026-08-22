import { Link } from 'react-router-dom';
import { Mail, MessageCircle, MapPin, Clock, LifeBuoy, ArrowRight } from 'lucide-react';
import PublicLayout, { Section, neu, CONTACT } from './PublicLayout';
import { waNumber } from '../../utils/whatsapp';

export default function ContactPage() {
  // Blank details are omitted rather than rendered as a dead link.
  const wa = CONTACT.phone ? waNumber(CONTACT.phone) : null;

  return (
    <PublicLayout
      title="Contact us"
      intro="Questions about setting up, pricing, or getting your existing stock into the system — reach us however suits you."
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <a href={`mailto:${CONTACT.email}`} className="p-5 block hover:opacity-90 transition-opacity" style={neu.card}>
          <Mail size={19} className="text-stone-500" />
          <p className="text-sm font-semibold text-stone-900 mt-3">Email</p>
          <p className="text-sm text-stone-600 mt-0.5 break-all">{CONTACT.email}</p>
          <p className="text-xs text-stone-400 mt-1.5">General enquiries and sales</p>
        </a>

        <a href={`mailto:${CONTACT.support}`} className="p-5 block hover:opacity-90 transition-opacity" style={neu.card}>
          <LifeBuoy size={19} className="text-stone-500" />
          <p className="text-sm font-semibold text-stone-900 mt-3">Support</p>
          <p className="text-sm text-stone-600 mt-0.5 break-all">{CONTACT.support}</p>
          <p className="text-xs text-stone-400 mt-1.5">Already using MauzoHalisi</p>
        </a>

        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
             className="p-5 block hover:opacity-90 transition-opacity" style={neu.card}>
            <MessageCircle size={19} style={{ color: '#25D366' }} />
            <p className="text-sm font-semibold text-stone-900 mt-3">WhatsApp</p>
            <p className="text-sm text-stone-600 mt-0.5">{CONTACT.phone}</p>
            <p className="text-xs text-stone-400 mt-1.5">Usually the fastest way</p>
          </a>
        )}

        <div className="p-5" style={neu.card}>
          <MapPin size={19} className="text-stone-500" />
          <p className="text-sm font-semibold text-stone-900 mt-3">Where we are</p>
          <p className="text-sm text-stone-600 mt-0.5">{CONTACT.city}</p>
          <p className="text-xs text-stone-400 mt-1.5">Visits by appointment</p>
        </div>
      </div>

      <Section title="When we answer">
        <div className="p-4 flex gap-3" style={neu.inset}>
          <Clock size={16} className="text-stone-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="text-stone-700"><strong className="text-stone-900">Monday to Friday</strong> · 8:00 – 18:00</p>
            <p className="text-stone-700 mt-0.5"><strong className="text-stone-900">Saturday</strong> · 9:00 – 14:00</p>
            <p className="text-stone-500 mt-1.5 text-[13px]">
              East Africa Time. Messages outside these hours are answered the next working morning.
            </p>
          </div>
        </div>
      </Section>

      <Section title="Moving from something else?">
        <p>
          If you are keeping stock in a book, a spreadsheet, or another system, tell us what you
          have and we will help you bring it across. Products and opening stock import from a CSV,
          so most shops are trading on the first day rather than typing for a week.
        </p>
      </Section>

      <div className="p-6 sm:p-7" style={neu.card}>
        <h2 className="text-lg font-bold text-stone-900">Rather just try it?</h2>
        <p className="text-sm text-stone-600 mt-1.5 max-w-lg">
          Thirty days free and no card needed. You can always reach us once you are inside.
        </p>
        <Link to="/register"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-semibold hover:bg-stone-800 transition-colors mt-5">
          Start free trial <ArrowRight size={14} />
        </Link>
      </div>
    </PublicLayout>
  );
}
