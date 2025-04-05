// components/dialogs/ApiKeyDialog.tsx
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Copy, KeyRound, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
// import { TPA } from "@/types/tpa";
import api from '@/services/api.service';
import { AppI } from '@augmentos/sdk';
import { TPA } from '@/types/tpa';

interface ApiKeyDialogProps {
  tpa: AppI | null;
  apiKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ tpa, open, onOpenChange, apiKey }) => {
  // Local states for dialog
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [_apiKey, setApiKey] = useState(apiKey); // Start with empty string
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastRegenerated, setLastRegenerated] = useState(new Date());

  // Format API key to be partially masked
  const formatApiKey = (key: string): string => {
    if (!key) return "";
    
    // If there's no key or invalid key, show a masked placeholder
    if (!key || key.length < 10) {
      return "********-****-****-****-************";
    }
    
    // It's a real key, show partially masked
    const prefix = key.substring(0, 10);
    const suffix = key.substring(key.length - 5);
    return `${prefix}...${suffix}`;
  };

  // Copy API key to clipboard
  const handleCopyApiKey = () => {
    navigator.clipboard.writeText(_apiKey).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // Start regeneration process
  const handleStartRegenerate = () => {
    setShowConfirmation(true);
  };

  // Cancel regeneration
  const handleCancelRegeneration = () => {
    setShowConfirmation(false);
  };

  // Confirm regeneration
  const handleConfirmRegenerate = async () => {
    if (!tpa) return;
    
    setIsRegenerating(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Call API to regenerate key
      const response = await api.apps.apiKey.regenerate(tpa.packageName);
      setApiKey(response.apiKey);
      setLastRegenerated(new Date());
      setSuccess("API key regenerated successfully");
      setShowConfirmation(false);
    } catch (err: unknown) {
      console.error(err);
      setError("Failed to regenerate API key. Please try again.");
    } finally {
      setIsRegenerating(false);
    }
  };

  // Update local state when apiKey prop changes (only if it's a real key)
  useEffect(() => {
    if (apiKey && apiKey.length > 10 && !apiKey.includes("********")) {
      setApiKey(apiKey);
      // Only show success message if we have a real, newly generated key
      setSuccess("API key regenerated successfully");
    }
  }, [apiKey]);

  // Reset dialog state when opened
  useEffect(() => {
    if (open && tpa) {
      // Use the apiKey provided by props if available
      if (apiKey && apiKey.length > 10) {
        setApiKey(apiKey);
      }
      
      // Always reset these states when dialog opens
      if (!apiKey || apiKey.length <= 10) {
        setSuccess(null); // Only clear success if we don't have a newly generated key
      }
      setError(null);
      setShowConfirmation(false);
      setIsCopied(false);
    }
  }, [open, tpa, apiKey]);

  // When dialog closes, reset states
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Reset states when dialog closes
      setShowConfirmation(false);
      setError(null);
      setSuccess(null);
      setIsCopied(false);
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            API Key
          </DialogTitle>
          <DialogDescription>
            {tpa && `API key for ${tpa.name}`}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-6">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {/* Success Alert */}
          {success && (
            <Alert className="mb-4 bg-green-50 text-green-800 border-green-200">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-700">{success}</AlertDescription>
            </Alert>
          )}
          
          {/* Regeneration Confirmation */}
          {showConfirmation ? (
            <div className="space-y-4">
              <Alert variant="destructive" className="bg-amber-50 border-amber-200 text-amber-800">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-700">
                  Warning: Regenerating this API key will invalidate the previous key. 
                  Any applications using the old key will stop working.
                </AlertDescription>
              </Alert>
              <p className="text-sm text-gray-500">
                Are you sure you want to continue?
              </p>
              <div className="flex gap-2 justify-end">
                <Button 
                  variant="outline" 
                  onClick={handleCancelRegeneration}
                  disabled={isRegenerating}
                >
                  Cancel
                </Button>
                <Button 
                  variant="destructive"
                  onClick={handleConfirmRegenerate}
                  disabled={isRegenerating}
                >
                  {isRegenerating ? 
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Regenerating...
                    </> :
                    'Regenerate Key'
                  }
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-2 mb-4">
                <p className="text-sm text-gray-500">
                  Your API key is used to authenticate your app with AugmentOS cloud services.
                  Keep it secure and never share it publicly.
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 font-mono text-sm p-2 border rounded-md bg-gray-50 overflow-x-auto">
                    {formatApiKey(_apiKey)}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={handleCopyApiKey}
                    className="shrink-0"
                  >
                    {isCopied ? 
                      <CheckCircle className="h-4 w-4 text-green-600" /> : 
                      <Copy className="h-4 w-4" />
                    }
                  </Button>
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-sm font-medium">Webhook URL</h3>
                <div className="font-mono text-sm p-2 border rounded-md bg-gray-50 overflow-x-auto">
                  {tpa?.publicUrl ? `${tpa.publicUrl}/webhook` : 'No server URL defined'}
                </div>
                <p className="text-xs text-gray-500">
                  This is the full webhook URL where AugmentOS will send events to your app.
                </p>
              </div>
            </>
          )}
        </div>
        
        {!showConfirmation && (
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <p className="text-xs text-gray-500">
              Last regenerated: {lastRegenerated.toLocaleDateString()}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button variant="destructive" onClick={handleStartRegenerate}>
                Regenerate Key
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ApiKeyDialog;