import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeValue } from '@investing-hub/shared/localization';
import { changeLanguage, initialLanguageWarning } from '../lib/i18n';
export function LanguageSelector() {
  const { t, i18n } = useTranslation('common');
  const [warning, setWarning] = useState(initialLanguageWarning);
  return (
    <div className="language-control">
      <label>
        <span>{t('language')}</span>
        <select
          aria-label={t('language')}
          value={i18n.resolvedLanguage}
          onChange={(event) => setWarning(changeLanguage(localeValue(event.target.value)))}
        >
          <option value="tr-TR" lang="tr">
            Türkçe
          </option>
          <option value="en-US" lang="en">
            English
          </option>
        </select>
      </label>
      {warning && <span role="status">{t(warning)}</span>}
    </div>
  );
}
