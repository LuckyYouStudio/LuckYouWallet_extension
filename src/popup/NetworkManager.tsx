import React, { useState, useEffect } from 'react';
import {
  NetworkConfig,
  NetworkKey,
  addCustomNetwork,
  removeCustomNetwork,
  getAllNetworks,
  getCurrentNetwork,
  setCurrentNetwork,
  validateNetwork,
  DEFAULT_NETWORKS,
  updateCustomNetwork,
} from '../core/wallet';
import { translations, Lang, TranslationKey } from '../core/i18n';
import './NetworkManager.css';

interface NetworkManagerProps {
  onNetworkChange: (network: NetworkKey) => void;
  currentNetwork: NetworkKey;
  lang: Lang;
}

const NetworkManager: React.FC<NetworkManagerProps> = ({
  onNetworkChange,
  currentNetwork,
  lang,
}) => {
  const [networks, setNetworks] = useState<Record<string, NetworkConfig>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingNetwork, setEditingNetwork] = useState<string | null>(null);
  const [newNetwork, setNewNetwork] = useState({
    name: '',
    rpcUrl: '',
    chainId: '',
    currencySymbol: '',
    blockExplorer: '',
  });
  const [editNetwork, setEditNetwork] = useState({
    name: '',
    rpcUrl: '',
    chainId: '',
    currencySymbol: '',
    blockExplorer: '',
  });
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const t = (key: TranslationKey) => translations[lang][key];

  useEffect(() => {
    loadNetworks();
  }, []);

  const loadNetworks = async () => {
    const allNetworks = await getAllNetworks();
    setNetworks(allNetworks);
  };

  const handleNetworkSwitch = async (networkKey: NetworkKey) => {
    setLoading(true);
    try {
      await setCurrentNetwork(networkKey);
      onNetworkChange(networkKey);
    } catch (error) {
      console.error('Failed to switch network:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNetwork = async () => {
    if (!newNetwork.name || !newNetwork.rpcUrl || !newNetwork.chainId || !newNetwork.currencySymbol) {
      setValidationError('请填写所有必填字段');
      return;
    }

    const chainId = parseInt(newNetwork.chainId);
    if (isNaN(chainId) || chainId <= 0) {
      setValidationError('链ID必须是有效的正整数');
      return;
    }

    setValidating(true);
    setValidationError(null);

    try {
      const isValid = await validateNetwork(newNetwork.rpcUrl, chainId);
      if (!isValid) {
        setValidationError('网络验证失败，请检查RPC URL和链ID');
        return;
      }

      await addCustomNetwork({
        name: newNetwork.name,
        rpcUrl: newNetwork.rpcUrl,
        chainId,
        currencySymbol: newNetwork.currencySymbol,
        blockExplorer: newNetwork.blockExplorer || undefined,
      });

      setNewNetwork({
        name: '',
        rpcUrl: '',
        chainId: '',
        currencySymbol: '',
        blockExplorer: '',
      });
      setShowAddForm(false);
      await loadNetworks();
    } catch (error) {
      setValidationError('添加网络失败: ' + (error as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const handleEditNetwork = (networkKey: string, network: NetworkConfig) => {
    setEditingNetwork(networkKey);
    setEditNetwork({
      name: network.name,
      rpcUrl: network.rpcUrl,
      chainId: network.chainId.toString(),
      currencySymbol: network.currencySymbol,
      blockExplorer: network.blockExplorer || '',
    });
  };

  const handleUpdateNetwork = async () => {
    if (!editNetwork.name || !editNetwork.rpcUrl || !editNetwork.chainId || !editNetwork.currencySymbol) {
      setValidationError('请填写所有必填字段');
      return;
    }

    const chainId = parseInt(editNetwork.chainId);
    if (isNaN(chainId) || chainId <= 0) {
      setValidationError('链ID必须是有效的正整数');
      return;
    }

    if (!editingNetwork) return;

    setValidating(true);
    setValidationError(null);

    try {
      const isValid = await validateNetwork(editNetwork.rpcUrl, chainId);
      if (!isValid) {
        setValidationError('网络验证失败，请检查RPC URL和链ID');
        return;
      }

      await updateCustomNetwork(editingNetwork, {
        name: editNetwork.name,
        rpcUrl: editNetwork.rpcUrl,
        chainId,
        currencySymbol: editNetwork.currencySymbol,
        blockExplorer: editNetwork.blockExplorer || undefined,
      });

      setEditingNetwork(null);
      setEditNetwork({
        name: '',
        rpcUrl: '',
        chainId: '',
        currencySymbol: '',
        blockExplorer: '',
      });
      await loadNetworks();
    } catch (error) {
      setValidationError('更新网络失败: ' + (error as Error).message);
    } finally {
      setValidating(false);
    }
  };

  const cancelEdit = () => {
    setEditingNetwork(null);
    setEditNetwork({
      name: '',
      rpcUrl: '',
      chainId: '',
      currencySymbol: '',
      blockExplorer: '',
    });
    setValidationError(null);
  };

  const handleRemoveNetwork = async (chainId: number) => {
    try {
      await removeCustomNetwork(chainId);
      await loadNetworks();
      
      // 如果删除的是当前网络，切换到主网
      const currentNetworkConfig = networks[currentNetwork];
      if (currentNetworkConfig?.chainId === chainId) {
        await handleNetworkSwitch('mainnet');
      }
    } catch (error) {
      console.error('Failed to remove network:', error);
    }
  };

  const isDefaultNetwork = (networkKey: string) => {
    return networkKey in DEFAULT_NETWORKS;
  };

  return (
    <div className="network-manager">
      <div className="network-manager-header">
        <h3>{t('networks')}</h3>
        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? t('cancel') : t('addNetwork')}
        </button>
      </div>

      {showAddForm && (
        <div className="add-network-form">
          <h4>{t('addCustomNetwork')}</h4>
          <div className="form-group">
            <label>{t('networkName')}</label>
            <input
              type="text"
              value={newNetwork.name}
              onChange={(e) => setNewNetwork({ ...newNetwork, name: e.target.value })}
              placeholder={t('enterNetworkName')}
            />
          </div>
          <div className="form-group">
            <label>{t('rpcUrl')}</label>
            <input
              type="url"
              value={newNetwork.rpcUrl}
              onChange={(e) => setNewNetwork({ ...newNetwork, rpcUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="form-group">
            <label>{t('chainId')}</label>
            <input
              type="number"
              value={newNetwork.chainId}
              onChange={(e) => setNewNetwork({ ...newNetwork, chainId: e.target.value })}
              placeholder="1"
            />
          </div>
          <div className="form-group">
            <label>{t('currencySymbol')}</label>
            <input
              type="text"
              value={newNetwork.currencySymbol}
              onChange={(e) => setNewNetwork({ ...newNetwork, currencySymbol: e.target.value })}
              placeholder="ETH"
            />
          </div>
          <div className="form-group">
            <label>{t('blockExplorer')} ({t('optional')})</label>
            <input
              type="url"
              value={newNetwork.blockExplorer}
              onChange={(e) => setNewNetwork({ ...newNetwork, blockExplorer: e.target.value })}
              placeholder="https://..."
            />
          </div>
          {validationError && (
            <div className="error-message">{validationError}</div>
          )}
          <div className="form-actions">
            <button
              className="btn btn-primary"
              onClick={handleAddNetwork}
              disabled={validating}
            >
              {validating ? t('validating') : t('addNetwork')}
            </button>
          </div>
        </div>
      )}

      <div className="networks-list">
        {Object.entries(networks).map(([key, network]) => (
          <div
            key={key}
            className={`network-item ${currentNetwork === key ? 'active' : ''}`}
          >
            {editingNetwork === key ? (
              <div className="edit-network-form">
                <h4>{t('editNetwork')}</h4>
                <div className="form-group">
                  <label>{t('networkName')}</label>
                  <input
                    type="text"
                    value={editNetwork.name}
                    onChange={(e) => setEditNetwork({ ...editNetwork, name: e.target.value })}
                    placeholder={t('enterNetworkName')}
                  />
                </div>
                <div className="form-group">
                  <label>{t('rpcUrl')}</label>
                  <input
                    type="url"
                    value={editNetwork.rpcUrl}
                    onChange={(e) => setEditNetwork({ ...editNetwork, rpcUrl: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div className="form-group">
                  <label>{t('chainId')}</label>
                  <input
                    type="number"
                    value={editNetwork.chainId}
                    onChange={(e) => setEditNetwork({ ...editNetwork, chainId: e.target.value })}
                    placeholder="1"
                  />
                </div>
                <div className="form-group">
                  <label>{t('currencySymbol')}</label>
                  <input
                    type="text"
                    value={editNetwork.currencySymbol}
                    onChange={(e) => setEditNetwork({ ...editNetwork, currencySymbol: e.target.value })}
                    placeholder="ETH"
                  />
                </div>
                <div className="form-group">
                  <label>{t('blockExplorer')} ({t('optional')})</label>
                  <input
                    type="url"
                    value={editNetwork.blockExplorer}
                    onChange={(e) => setEditNetwork({ ...editNetwork, blockExplorer: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                {validationError && (
                  <div className="error-message">{validationError}</div>
                )}
                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    onClick={handleUpdateNetwork}
                    disabled={validating}
                  >
                    {validating ? t('validating') : t('updateNetwork')}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={cancelEdit}
                    disabled={validating}
                  >
                    {t('cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="network-info">
                  <div className="network-name">
                    {network.name}
                    {network.isCustom && <span className="custom-badge">{t('custom')}</span>}
                  </div>
                  <div className="network-details">
                    <span className="chain-id">Chain ID: {network.chainId}</span>
                    <span className="currency">{network.currencySymbol}</span>
                  </div>
                </div>
                <div className="network-actions">
                  {currentNetwork !== key && (
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleNetworkSwitch(key)}
                      disabled={loading}
                    >
                      {t('switch')}
                    </button>
                  )}
                  {currentNetwork === key && (
                    <span className="current-badge">{t('current')}</span>
                  )}
                  {network.isCustom && (
                    <>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => handleEditNetwork(key, network)}
                        disabled={loading}
                      >
                        {t('edit')}
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleRemoveNetwork(network.chainId)}
                        disabled={loading}
                      >
                        {t('remove')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default NetworkManager;
