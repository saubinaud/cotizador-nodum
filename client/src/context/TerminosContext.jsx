import { createContext, useContext } from 'react';

const DEFAULTS = {
  insumos: 'Insumos',
  preparaciones: 'Preparaciones',
  productos: 'Productos',
  materiales: 'Materiales',
  ficha_tecnica: 'Ficha técnica',
  merma: 'Merma',
  desmedro: 'Desmedro',
  tanda: 'Tanda',
  rendimiento: 'Rendimiento',
  prep_pred: 'Prep. predeterminadas',
};

const TerminosContext = createContext(DEFAULTS);

export function TerminosProvider({ terminos, children }) {
  const merged = { ...DEFAULTS, ...(terminos || {}) };
  return (
    <TerminosContext.Provider value={merged}>
      {children}
    </TerminosContext.Provider>
  );
}

export function useTerminos() {
  return useContext(TerminosContext);
}

export { DEFAULTS as DEFAULT_TERMINOS };
