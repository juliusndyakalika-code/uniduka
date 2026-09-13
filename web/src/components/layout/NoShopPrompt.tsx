import { useNavigate } from 'react-router-dom';
import { Store, ArrowRight, Package, ShoppingCart, BarChart2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

/**
 * Shown in place of any page that needs a shop, when the account has none yet.
 *
 * Registration deliberately stops at the account, so a new owner lands in the
 * app before a shop exists. Rather than letting every page fail its way through
 * a 403 ("No active shop context"), the shell renders this — it names the one
 * thing standing in the way and links straight to the wizard.
 */
export default function NoShopPrompt() {
  const navigate = useNavigate();
  const { account } = useAuthStore();

  return (
    <div className="max-w-lg mx-auto mt-6 sm:mt-16 text-center">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
        style={{ background: '#a6662418', color: '#a66624' }}>
        <Store size={26} />
      </div>

      <h1 className="text-2xl font-bold text-stone-900 mb-2">
        {account?.legalName ? `Welcome, ${account.legalName}` : 'Welcome'}
      </h1>
      <p className="text-stone-500 leading-relaxed mb-8">
        Your account is ready. Add your first shop and you can start selling.
        It takes about a minute, and everything is set up for your business type
        automatically.
      </p>

      <button onClick={() => navigate('/setup/wizard')}
        className="btn-primary py-3 px-7 mx-auto">
        Create Your Shop <ArrowRight size={16} />
      </button>

      <div className="grid grid-cols-3 gap-3 mt-10 text-left">
        {[
          { icon: ShoppingCart, label: 'Sell',    desc: 'Till and receipts' },
          { icon: Package,      label: 'Stock',   desc: 'Products and levels' },
          { icon: BarChart2,    label: 'Reports', desc: 'Sales and profit' },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="p-3 rounded-xl bg-white/60 border border-stone-200/70">
            <Icon size={15} className="text-stone-400 mb-1.5" />
            <p className="text-xs font-semibold text-stone-700">{label}</p>
            <p className="text-[11px] text-stone-400 leading-snug">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
