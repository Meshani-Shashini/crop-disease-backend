import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { DetectionWithDetails } from '../types';
import Navbar from '../components/Navbar';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Pill,
  FileText,
  Calendar,
  Percent,
  Leaf,
  Loader2,
  Download,
} from 'lucide-react';

export default function DetectionResult() {
  const { id } = useParams<{ id: string }>();
  const { language, t } = useLanguage();
  const [detection, setDetection] = useState<DetectionWithDetails | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) fetchDetection();
  }, [id]);

  const fetchDetection = async () => {
    try {
      const { data: detectionData } = await supabase
        .from('detections')
        .select('*')
        .eq('id', id)
        .single();

      if (detectionData) {
        let treatment = null;
        let disease = null;

        if (detectionData.disease_id) {
          const { data: diseaseData } = await supabase
            .from('diseases')
            .select('*, crops(crop_name)')
            .eq('id', detectionData.disease_id)
            .single();

          disease = diseaseData;

          const { data: treatmentData } = await supabase
            .from('treatments')
            .select('*')
            .eq('disease_id', detectionData.disease_id)
            .single();

          treatment = treatmentData;
        }

        setDetection({
          ...detectionData,
          treatment,
          disease,
        } as DetectionWithDetails);
      }
    } catch (error) {
      console.error('Error fetching detection:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEffectiveSeverity = (severity: string | undefined, diseaseName: string) => {
    const normalizedDisease = diseaseName.toLowerCase();
    if (normalizedDisease.includes('healthy')) return 'low';
    if (
      normalizedDisease.includes('blight') ||
      normalizedDisease.includes('mildew') ||
      normalizedDisease.includes('anthracnose') ||
      normalizedDisease.includes('wilt') ||
      normalizedDisease.includes('phytophthora')
    ) {
      return 'high';
    }
    return severity || 'medium';
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 75) return 'text-blue-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const localizeText = (text: string) => {
    const translated = t(text.trim());
    return translated === text.trim() ? text : translated;
  };

  const getDisplayDiseaseName = () => {
    if (detection?.disease_name.toLowerCase().includes('healthy')) {
      return `Healthy ${detection.crop_name} Plant`;
    }
    return detection?.disease_name || 'Unknown';
  };

  const localizeSymptoms = (text?: string) => {
    const cleanText = text?.trim() || '';
    if (!cleanText || cleanText.toLowerCase() === 'n/a') {
      return t('No symptoms available for this result.');
    }
    return localizeText(cleanText);
  };

  const localizeTreatment = (text: string) => text
    .split('\n')
    .map((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex === -1) return localizeText(line);
      const label = line.slice(0, separatorIndex).trim().toLowerCase();
      const localizedLabel = label === 'organic' ? t('organic_treatment')
        : label === 'chemical' ? t('chemical_treatment')
          : label === 'prevention' ? t('prevention_tips')
            : line.slice(0, separatorIndex);
      const recommendation = line.slice(separatorIndex + 1).trim();
      const translatedRecommendation = recommendation
        .split(/(?<=[.!?])\s+/)
        .map((sentence) => localizeText(sentence))
        .join(' ');
      return `${localizedLabel}: ${translatedRecommendation}`;
    })
    .join('\n');

  const downloadPDF = () => {
    if (!detection) return;

    const document = new jsPDF();
    const margin = 16;
    const pageWidth = document.internal.pageSize.getWidth();
    const contentWidth = pageWidth - margin * 2;
    let yPosition = 22;

    const addWrappedText = (text: string, fontSize = 11, gap = 7) => {
      document.setFontSize(fontSize);
      const lines = document.splitTextToSize(text, contentWidth);
      if (yPosition + lines.length * gap > 280) {
        document.addPage();
        yPosition = 20;
      }
      document.text(lines, margin, yPosition);
      yPosition += lines.length * gap + 5;
    };

    document.setTextColor(46, 125, 50);
    document.setFont('helvetica', 'bold');
    document.setFontSize(19);
    document.text('CropGuard Detection Report', margin, yPosition);
    yPosition += 12;

    document.setTextColor(30, 30, 30);
    document.setFont('helvetica', 'normal');
    addWrappedText(`Crop: ${detection.crop_name}`);
    addWrappedText(`Diagnosis: ${getDisplayDiseaseName()}`);
    addWrappedText(`Confidence: ${detection.confidence}%`);
    addWrappedText(`Severity: ${effectiveSeverity}`);
    addWrappedText(`Scan Date: ${new Date(detection.scan_date).toLocaleDateString('en-LK')}`);

    const symptoms = detection.disease?.symptoms || detection.notes || 'No symptoms available.';
    addWrappedText(`Symptoms: ${symptoms}`);

    const treatment = detection.english_treatment
      || [detection.treatment?.organic_treatment, detection.treatment?.chemical_treatment]
        .filter(Boolean)
        .join('\n');
    if (treatment) {
      addWrappedText('Recommended Treatments', 14, 8);
      treatment.split('\n').forEach((line) => addWrappedText(line));
    }

    document.setFontSize(9);
    document.setTextColor(100, 100, 100);
    document.text('Generated by CropGuard', margin, 287);
    document.save(`cropguard-detection-${detection.id}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
        </div>
      </div>
    );
  }

  if (!detection) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <AlertTriangle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('detection_not_found')}</h2>
          <p className="text-gray-600 mb-6">{t('detection_not_found_desc')}</p>
          <Link to="/detect" className="btn-primary">
            <ArrowLeft className="w-5 h-5 mr-2" />
            {t('back_to_detection')}
          </Link>
        </div>
      </div>
    );
  }

  const isHealthy = detection.disease_name.toLowerCase().includes('healthy');
  const effectiveSeverity = getEffectiveSeverity(detection.severity, detection.disease_name);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <Link
            to="/detect"
            className="inline-flex items-center text-gray-600 hover:text-primary-600"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            {t('back_to_detection')}
          </Link>
          <button
            type="button"
            onClick={downloadPDF}
            className="btn-secondary inline-flex items-center"
          >
            <Download className="w-5 h-5 mr-2" />
            {t('download_pdf')}
          </button>
        </div>

        <div className="card overflow-hidden">
          {/* Header */}
          <div
            className={`px-6 py-4 ${
              isHealthy ? 'bg-green-50 border-b border-green-100' : 'bg-red-50 border-b border-red-100'
            }`}
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                {isHealthy ? (
                  <CheckCircle className="w-8 h-8 text-green-600" />
                ) : (
                  <AlertTriangle className="w-8 h-8 text-red-600" />
                )}
                <div>
                  <h1 className={`text-xl font-bold ${isHealthy ? 'text-green-900' : 'text-red-900'}`}>
                    {isHealthy ? t('Healthy') + '!' : t('diagnosed_disease') + '!'}
                  </h1>
                  <p className={`text-sm ${isHealthy ? 'text-green-700' : 'text-red-700'}`}>
                    {t(detection.crop_name)} - {t(getDisplayDiseaseName())}
                  </p>
                </div>
              </div>
              <div className={`badge ${getSeverityColor(effectiveSeverity)}`}>
                {t(effectiveSeverity.charAt(0).toUpperCase() + effectiveSeverity.slice(1)).toUpperCase()} {t('severity')}
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Image */}
              <div>
                {detection.image_url ? (
                  <img
                    src={detection.image_url}
                    alt={t('scanned_crop')}
                    className="w-full rounded-xl object-cover aspect-[4/3]"
                  />
                ) : (
                  <div className="w-full aspect-[4/3] bg-gray-100 rounded-xl flex items-center justify-center">
                    <Leaf className="w-16 h-16 text-gray-300" />
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 text-gray-600 mb-2">
                    <Percent className="w-4 h-4" />
                    <span className="text-sm font-medium">{t('confidence_score')}</span>
                  </div>
                  <p className={`text-3xl font-bold ${getConfidenceColor(detection.confidence)}`}>
                    {detection.confidence}%
                  </p>
                  <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary-600 rounded-full transition-all"
                      style={{ width: `${detection.confidence}%` }}
                    ></div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-2 text-gray-600 mb-2">
                    <Calendar className="w-4 h-4" />
                    <span className="text-sm font-medium">{t('scan_date')}</span>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(detection.scan_date).toLocaleDateString(
                      language === 'si' ? 'si-LK' : language === 'ta' ? 'ta-LK' : 'en-LK',
                      {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      },
                    )}
                  </p>
                </div>

                {(detection.disease?.symptoms || detection.notes || !isHealthy) && (
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2 text-gray-600 mb-2">
                      <FileText className="w-4 h-4" />
                      <span className="text-sm font-medium">{t('symptoms')}</span>
                    </div>
                    <p className="text-gray-700">{localizeSymptoms(detection.disease?.symptoms || detection.notes)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Model Treatments */}
            {!isHealthy && (
              <div className="mt-6 p-6 bg-emerald-50 dark:bg-slate-700 rounded-xl border border-emerald-200 dark:border-emerald-500/40">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Leaf className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-emerald-950 dark:text-white mb-2">
                      {t('recommended_treatments')}
                    </h3>
                    <div className="space-y-4">
                      {t('symptoms') === 'රෝග ලක්ෂණ' ? (
                        <>
                          <div className="text-emerald-900 dark:text-slate-100 whitespace-pre-line leading-relaxed font-medium">
                            {localizeTreatment(detection.sinhala_treatment || detection.english_treatment || 'Consult local agriculture officer.')}
                          </div>
                          {detection.sinhala_treatment && detection.english_treatment && (
                            <div className="border-t border-emerald-200 dark:border-slate-500 pt-3 mt-3">
                              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold uppercase mb-1">{t('english_details')}</p>
                              <div className="text-emerald-900 dark:text-slate-100 whitespace-pre-line leading-relaxed text-sm">
                                {localizeTreatment(detection.english_treatment)}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="text-emerald-900 dark:text-slate-100 whitespace-pre-line leading-relaxed font-medium">
                            {localizeTreatment(detection.english_treatment || [
                              detection.treatment?.organic_treatment,
                              detection.treatment?.chemical_treatment,
                            ].filter(Boolean).join('\n\n') || 'Consult local agriculture officer.')}
                          </div>
                          {detection.sinhala_treatment && (
                            <div className="border-t border-emerald-200 dark:border-slate-500 pt-3 mt-3">
                              <p className="text-xs text-emerald-700 dark:text-emerald-300 font-bold uppercase mb-1">{language === 'ta' ? t('tamil_details') : t('sinhala_details')}</p>
                              <div className="text-emerald-900 dark:text-slate-100 whitespace-pre-line leading-relaxed text-sm">
                                {localizeTreatment(detection.sinhala_treatment)}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Treatment CTA */}
            {!isHealthy && detection.disease_id && (
              <div className="mt-6 p-6 bg-primary-50 rounded-xl border border-primary-100">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary-600 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Pill className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {t('symptoms') === 'Symptoms' ? 'Treatment Available' : (t('symptoms') === 'රෝග ලක්ෂණ' ? 'ප්‍රතිකාර ලබාගත හැක' : 'சிகிச்சை கிடைக்கிறது')}
                    </h3>
                    <p className="text-gray-600 mb-4">
                      {t('symptoms') === 'Symptoms'
                        ? 'Get detailed treatment recommendations including organic treatments, chemical options, and locally available products in Sri Lanka.'
                        : (t('symptoms') === 'රෝග ලක්ෂණ'
                          ? 'කාබනික ප්‍රතිකාර, රසායනික ක්‍රම සහ ශ්‍රී ලංකාව තුළ දේශීයව ලබාගත හැකි නිෂ්පාදන ඇතුළුව සවිස්තරාත්මක ප්‍රතිකාර නිර්දේශ ලබා ගන්න.'
                          : 'கரிம சிகிச்சைகள், இரசாயன விருப்பங்கள் மற்றும் இலங்கையில் உள்ளூரில் கிடைக்கக்கூடிய தயாரிப்புகள் உட்பட விரிவான சிகிச்சை பரிந்துரைகளைப் பெறுங்கள்.')}
                    </p>
                    <Link
                      to={`/treatment/${detection.disease_id}`}
                      className="btn-primary inline-flex"
                    >
                      {t('view_recommendations')}
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {isHealthy && detection.disease?.prevention && (
              <div className="mt-6 p-6 bg-green-50 rounded-xl border border-green-100">
                <h3 className="text-lg font-semibold text-green-900 mb-2">
                  {t('prevention_tips')}
                </h3>
                <p className="text-green-800">{t(detection.disease.prevention)}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
