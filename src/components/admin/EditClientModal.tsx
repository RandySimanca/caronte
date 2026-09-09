import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { AdminService } from '@/services/AdminService';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface EditClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: any; // client object from Supabase (needs id, full_name, document_id, phone, address)
  onUpdated: () => void;
}

export function EditClientModal({ isOpen, onClose, client, onUpdated }: EditClientModalProps) {
  const [fullName, setFullName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen && client) {
      setFullName(client.full_name || '');
      setDocumentId(client.document_id || '');
      setPhone(client.phone || '');
      setAddress(client.address || '');
    }
  }, [isOpen, client]);

  if (!isOpen || !client) return null;

  const hasChanges = 
    fullName !== client.full_name || 
    documentId !== client.document_id || 
    phone !== (client.phone || '') || 
    address !== (client.address || '');

  const handleSave = async () => {
    if (!fullName || !documentId) {
      toast.error('El nombre y la cédula son obligatorios');
      return;
    }

    setIsSaving(true);
    try {
      await AdminService.updateClient(client.id, {
        full_name: fullName,
        document_id: documentId,
        phone: phone || undefined,
        address: address || undefined,
      });
      toast.success('Cliente actualizado correctamente');
      onUpdated();
      onClose();
    } catch (error: any) {
      console.error('Error updating client:', error);
      toast.error('Error al actualizar el cliente: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        />
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 10 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 10 }}
          className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
            <h2 className="text-lg font-bold text-slate-800">Editar Cliente</h2>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Nombre Completo *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 font-medium"
              />
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Cédula *</label>
              <input
                type="text"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 font-medium"
              />
              <p className="text-xs text-amber-600 mt-1 font-medium">⚠️ Cambiar la cédula afectará cómo se busca al cliente.</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Teléfono</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 font-medium"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-600 mb-1">Dirección</label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-800 font-medium"
              />
            </div>
          </div>

          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-200 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !hasChanges || !fullName || !documentId}
              className={cn(
                "flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition-all",
                isSaving || !hasChanges || !fullName || !documentId
                  ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/30"
              )}
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
