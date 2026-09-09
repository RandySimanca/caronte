import { useState, useEffect } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { db } from '@/db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import { useSyncStore } from '@/stores/syncStore';
import { cn } from '@/lib/utils';

export function EditClientPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { isOnline } = useSyncStore();

  const client = useLiveQuery(() => id ? db.clients.get(id) : undefined, [id]);

  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (client) {
      setClientName(client.full_name || '');
      setPhone(client.phone || '');
      setAddress(client.address || '');
    }
  }, [client]);

  const handleSave = async () => {
    if (!client || !id || !clientName) return;
    setIsSaving(true);

    try {
      const updatedClient = {
        ...client,
        full_name: clientName,
        phone: phone || null,
        address: address || null,
        updated_at: new Date().toISOString(),
      };

      await db.transaction('rw', db.clients, db.syncQueue, async () => {
        // Update locally
        await db.clients.update(id, updatedClient);

        // Queue for server sync
        await db.syncQueue.add({
          operation_id: uuidv4(),
          operation_type: 'UPDATE_CLIENT',
          payload: {
            clientId: id,
            client: updatedClient,
          },
          status: 'pending',
          local_timestamp: new Date().toISOString(),
          retry_count: 0,
        });
      });

      toast.success(`Cliente actualizado correctamente${isOnline ? '' : ' (se sincronizará en línea)'}`);
      navigate(-1);
    } catch (error: any) {
      console.error('Error updating client:', error);
      toast.error('Error al actualizar el cliente.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!client) {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <header className="bg-white px-4 py-3 border-b border-slate-100 flex items-center">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-bold text-slate-800 ml-2">Editar Cliente</h1>
        </header>
        <div className="flex-1 flex items-center justify-center text-slate-400">
          <p>Cargando información...</p>
        </div>
      </div>
    );
  }

  const hasChanges = clientName !== client.full_name || phone !== (client.phone || '') || address !== (client.address || '');

  return (
    <div className="flex flex-col h-full bg-slate-50 relative">
      <header className="bg-white px-4 py-3 border-b border-slate-100 flex items-center justify-between sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-slate-600">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-bold text-slate-800">Editar Cliente</h1>
        <div className="w-10"></div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Cédula (No se puede editar)</label>
            <input 
              type="text" 
              value={client.document_id} 
              disabled 
              className="w-full bg-slate-100 border border-slate-200 text-slate-500 rounded-xl px-3 py-2.5 text-sm cursor-not-allowed" 
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre completo *</label>
            <input 
              type="text" 
              value={clientName} 
              onChange={e => setClientName(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none transition-colors" 
              placeholder="Juan Pérez" 
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
            <input 
              type="tel" 
              value={phone} 
              onChange={e => setPhone(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none transition-colors" 
              placeholder="300 987 6543" 
            />
          </div>
          
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Dirección</label>
            <input 
              type="text" 
              value={address} 
              onChange={e => setAddress(e.target.value)} 
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none transition-colors" 
              placeholder="Calle 5 # 12-34" 
            />
          </div>

        </div>
      </div>

      <div className="p-4 bg-white border-t border-slate-100">
        <button
          onClick={handleSave}
          disabled={!hasChanges || !clientName || isSaving}
          className={cn(
            "w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-[0.98]",
            hasChanges && clientName && !isSaving
              ? "bg-brand-600 hover:bg-brand-700 text-white shadow-brand-500/30"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          )}
        >
          {isSaving ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save className="w-5 h-5" />
          )}
          {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
}
