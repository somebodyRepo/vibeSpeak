import { useState } from 'react';
import { updateSessionTable } from '../../lib/api';

interface TableData {
  rows: Array<{ dimension: string; value: string }>;
}

interface SessionTableViewProps {
  tableContent: string;
  sessionId: string;
  onUpdate?: (tableContent: string) => void;
}

export function SessionTableView({ tableContent, sessionId, onUpdate }: SessionTableViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedRows, setEditedRows] = useState<Array<{ dimension: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);

  if (!tableContent) {
    return (
      <div className="p-4 rounded-xl bg-gray-50 text-slate-400 text-center">
        暂无表格数据
      </div>
    );
  }

  let tableData: TableData | null = null;
  let parseError: string | null = null;

  try {
    tableData = JSON.parse(tableContent);
  } catch (e) {
    parseError = '表格数据格式无效';
  }

  if (parseError) {
    return (
      <div className="p-4 rounded-xl bg-red-50 text-red-600 text-center">
        {parseError}
      </div>
    );
  }

  if (!tableData?.rows?.length) {
    return (
      <div className="p-4 rounded-xl bg-gray-50 text-slate-400 text-center">
        表格数据为空
      </div>
    );
  }

  const handleEdit = () => {
    setEditedRows([...tableData!.rows]);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedRows([]);
    setIsEditing(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const newTableContent = JSON.stringify({ rows: editedRows });
      await updateSessionTable(sessionId, newTableContent);
      setIsEditing(false);
      onUpdate?.(newTableContent);
    } catch (err) {
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setSaving(false);
    }
  };

  const updateRow = (index: number, field: 'dimension' | 'value', newValue: string) => {
    const newRows = [...editedRows];
    newRows[index] = { ...newRows[index], [field]: newValue };
    setEditedRows(newRows);
  };

  const addRow = () => {
    setEditedRows([...editedRows, { dimension: '', value: '' }]);
  };

  const removeRow = (index: number) => {
    const newRows = editedRows.filter((_, i) => i !== index);
    setEditedRows(newRows);
  };

  return (
    <div className="space-y-3">
      {/* Edit Warning */}
      {isEditing && (
        <div className="p-2 rounded-lg bg-amber-50 text-amber-700 text-sm">
          ⚠️ 手动编辑后，重新生成将覆盖当前内容
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        {!isEditing ? (
          <button
            onClick={handleEdit}
            className="px-3 py-1 rounded-lg text-sm font-medium text-blue-600
                       bg-blue-50 hover:bg-blue-100
                       cursor-pointer transition-colors"
          >
            编辑
          </button>
        ) : (
          <>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="px-3 py-1 rounded-lg text-sm font-medium text-slate-600
                         bg-gray-200 hover:bg-gray-300
                         disabled:opacity-50
                         cursor-pointer transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 rounded-lg text-sm font-medium text-white
                         bg-blue-500 hover:bg-blue-600
                         disabled:opacity-50
                         cursor-pointer transition-colors"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </>
        )}
      </div>

      {/* Table/Form */}
      {isEditing ? (
        <div className="space-y-2">
          {editedRows.map((row, index) => (
            <div key={index} className="flex gap-2 items-start">
              <input
                type="text"
                value={row.dimension}
                onChange={e => updateRow(index, 'dimension', e.target.value)}
                placeholder="维度名称"
                className="flex-shrink-0 w-32 px-3 py-2 rounded-lg bg-gray-100
                           text-slate-700 text-sm
                           shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06)]
                           focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="text"
                value={row.value}
                onChange={e => updateRow(index, 'value', e.target.value)}
                placeholder="内容"
                className="flex-1 px-3 py-2 rounded-lg bg-gray-100
                           text-slate-700 text-sm
                           shadow-[inset_2px_2px_6px_rgba(0,0,0,0.06)]
                           focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={() => removeRow(index)}
                className="p-2 rounded-lg text-red-500 hover:bg-red-50 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M3 20h18" />
                </svg>
              </button>
            </div>
          ))}
          <button
            onClick={addRow}
            className="w-full px-3 py-2 rounded-lg text-sm text-blue-600
                       bg-blue-50 hover:bg-blue-100
                       cursor-pointer transition-colors"
          >
            + 添加行
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-gray-50
                        shadow-[inset_2px_2px_6px_rgba(0,0,0,0.04)]">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 font-medium text-slate-700 bg-gray-100">维度</th>
                <th className="px-4 py-3 font-medium text-slate-700 bg-gray-100">内容</th>
              </tr>
            </thead>
            <tbody>
              {tableData.rows.map((row, index) => (
                <tr key={index} className="border-b border-gray-100 last:border-0">
                  <td className="px-4 py-2 font-medium text-slate-600 whitespace-nowrap">
                    {row.dimension}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {row.value || '未提及'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}