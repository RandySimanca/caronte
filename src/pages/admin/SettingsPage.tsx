import { useState } from 'react';
import { Settings, Calendar, Tags, SlidersHorizontal } from 'lucide-react';
import { HolidaysTab } from '@/components/admin/settings/HolidaysTab';
import { ExpenseCategoriesTab } from '@/components/admin/settings/ExpenseCategoriesTab';
import { SystemSettingsTab } from '@/components/admin/settings/SystemSettingsTab';

type Tab = 'holidays' | 'categories' | 'system';

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('holidays');

  const tabs = [
    { id: 'holidays', label: 'Feriados', icon: Calendar },
    { id: 'categories', label: 'Cat. Gastos', icon: Tags },
    { id: 'system', label: 'Parámetros', icon: SlidersHorizontal },
  ] as const;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2 mb-2">
          <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center">
            <Settings className="w-6 h-6" />
          </div>
          Configuraciones
        </h1>
        <p className="text-slate-500 ml-12">Gestiona el comportamiento del sistema, feriados y categorías.</p>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        {/* Tabs Header */}
        <div className="flex border-b border-slate-100 px-6 pt-4 gap-6 overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as Tab)}
              className={`flex items-center gap-2 pb-4 font-bold text-sm transition-colors border-b-2 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-brand-500 text-brand-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-brand-500' : 'text-slate-400'}`} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 bg-slate-50/50 min-h-[500px]">
          {activeTab === 'holidays' && <HolidaysTab />}
          {activeTab === 'categories' && <ExpenseCategoriesTab />}
          {activeTab === 'system' && <SystemSettingsTab />}
        </div>
      </div>
    </div>
  );
}
