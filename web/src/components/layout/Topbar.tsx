import { Menu, Bell, Search } from 'lucide-react';

interface Props { onMenuClick: () => void; title?: string; }
export default function Topbar({ onMenuClick, title }: Props) {
  return (
    <header className="h-14 bg-white border-b border-stone-200 flex items-center gap-4 px-4 flex-shrink-0">
      <button onClick={onMenuClick} className="lg:hidden p-1.5 text-stone-500 hover:text-stone-900">
        <Menu size={20} />
      </button>

      {title && <h1 className="text-sm font-semibold text-stone-900 hidden sm:block">{title}</h1>}

      <div className="flex-1 max-w-md hidden md:block">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder="Search products, customers…"
            className="w-full pl-8 pr-4 py-1.5 text-sm border border-stone-200 rounded-sm bg-stone-50 focus:bg-white focus:border-stone-900 focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button className="relative p-1.5 text-stone-400 hover:text-stone-900">
          <Bell size={18} />
          <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
      </div>
    </header>
  );
}
