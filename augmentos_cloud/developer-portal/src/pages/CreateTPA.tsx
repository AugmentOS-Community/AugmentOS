// pages/CreateTPA.tsx
import React, { useState } from 'react';
import { AxiosError } from 'axios';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeftIcon, AlertCircle, CheckCircle } from "lucide-react";
// import { Switch } from "@/components/ui/switch";
import DashboardLayout from "../components/DashboardLayout";
import ApiKeyDialog from "../components/dialogs/ApiKeyDialog";
import TpaSuccessDialog from "../components/dialogs/TpaSuccessDialog";
import api, { AppResponse } from '@/services/api.service';
import { AppI } from '@augmentos/sdk';
import { normalizeUrl } from '@/libs/utils';
import { toast } from 'sonner';
// import { TPA } from '@/types/tpa';

const CreateTPA: React.FC = () => {
  const navigate = useNavigate();

  // Form state
  const [formData, setFormData] = useState<Partial<AppI>>({
    packageName: '',
    name: '',
    description: '',
    publicUrl: '',
    logoURL: '',
    webviewURL: '',
    // isPublic: false,
    // tpaType: TpaType.STANDARD
  });

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dialog states
  const [createdTPA, setCreatedTPA] = useState<AppResponse | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [isApiKeyDialogOpen, setIsApiKeyDialogOpen] = useState(false);
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);

  // Handle form changes
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: Partial<AppI>) => ({
      ...prev,
      [name]: value
    }));

    // Clear error for field when changed
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Validate form
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Package name validation
    if (!formData.packageName) {
      newErrors.packageName = 'Package name is required';
    } else if (!/^[a-z0-9.-]+$/.test(formData.packageName)) {
      newErrors.packageName = 'Package name must use lowercase letters, numbers, dots, and hyphens only';
    }

    // Display name validation
    if (!formData.name) {
      newErrors.name = 'Display name is required';
    }

    // Description validation
    if (!formData.description) {
      newErrors.description = 'Description is required';
    }

    // Public URL validation
    if (!formData.publicUrl) {
      newErrors.publicUrl = 'Server URL is required';
    } else {
      try {
        new URL(formData.publicUrl);
      } catch (e) {
        console.error(e);
        newErrors.publicUrl = 'Please enter a valid URL';
      }
    }

    // Logo URL validation
    if (!formData.logoURL) {
      newErrors.logoURL = 'Logo URL is required';
    } else {
      try {
        new URL(formData.logoURL);
      } catch (e) {
        console.error(e);
        newErrors.logoURL = 'Please enter a valid URL';
      }
    }

    // Webview URL validation (optional)
    if (formData.webviewURL) {
      try {
        new URL(formData.webviewURL);
      } catch (e) {
        console.error(e);
        newErrors.webviewURL = 'Please enter a valid URL';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate form
    if (!validateForm()) {
      setFormError('Please fix the errors in the form');
      toast.error('Please fix the errors in the form');
      return;
    }

    setIsLoading(true);
    setFormError(null);

    try {
      // Normalize URLs before submission
      const normalizedFormData = {
        ...formData,
        publicUrl: normalizeUrl(formData.publicUrl || ''),
        webviewURL: formData.webviewURL ? normalizeUrl(formData.webviewURL) : undefined
      };

      // Call API to create TPA
      const result = await api.apps.create(normalizedFormData as AppI);

      console.log('TPA created:', result);

      // Set success message and state for dialog
      setSuccessMessage(`${formData.name} was created successfully!`);
      setCreatedTPA(result.app);

      // Store the API key from the result
      if (result.apiKey) {
        setApiKey(result.apiKey);
      }

      // Show a success toast without actions to avoid confusion
      toast.success(
        `${formData.name} was created successfully!`,
        {
          description: "Opening API key dialog...",
          duration: 3000, // Short duration
        }
      );

      // Use React state to directly open the API key dialog
      console.log("Setting isApiKeyDialogOpen to true");

      // First attempt
      setIsApiKeyDialogOpen(true);

      // Ensure dialog appears with a fallback
      setTimeout(() => {
        console.log("Fallback: Setting isApiKeyDialogOpen to true again");
        setIsApiKeyDialogOpen(true);
      }, 300);

      // Scroll to top without animation to avoid distractions
      window.scrollTo(0, 0);

    } catch (error: unknown) {
      console.error('Error creating TPA:', error);

      const errorMessage = (error as AxiosError<{ error: string }>).response?.data?.error ||
        (error as Error).message ||
        'Failed to create app. Please try again.';

      if (errorMessage.includes('already exists')) {
        setErrors({
          ...errors,
          packageName: 'This package name is already taken. Please choose another one.'
        });
      }

      setFormError(errorMessage);
      toast.error('Failed to create app', {
        description: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle API key dialog close - simplified to be more direct
  const handleApiKeyDialogClose = (open: boolean) => {
    console.log("API Key dialog state changing to:", open);
    setIsApiKeyDialogOpen(open);

    // If dialog is closing, navigate to TPA list
    if (!open) {
      navigate('/tpas');
    }
  };

  // Handle success dialog close
  const handleSuccessDialogClose = (open: boolean) => {
    setIsSuccessDialogOpen(open);
  };

  // Handle view API key button click
  const handleViewApiKey = () => {
    console.log("View API Key button clicked");
    setIsSuccessDialogOpen(false);
    // Open API key dialog immediately
    setIsApiKeyDialogOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center mb-6">
          <Link to="/tpas" className="flex items-center text-sm text-gray-500 hover:text-gray-700">
            <ArrowLeftIcon className="mr-1 h-4 w-4" />
            Back to Apps
          </Link>
        </div>

        <Card className="shadow-sm card border-2 transition-colors duration-300">
          <form onSubmit={handleSubmit}>
            <CardHeader>
              <CardTitle className="text-2xl">Create New TPA</CardTitle>
              <CardDescription>
                Fill out the form below to register your app for AugmentOS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pb-5">
              {formError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{formError}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="packageName">
                  Package Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="packageName"
                  name="packageName"
                  value={formData.packageName}
                  onChange={handleChange}
                  placeholder="e.g., org.example.myapp"
                  className={errors.packageName ? "border-red-500" : ""}
                />
                {errors.packageName && (
                  <p className="text-xs text-red-500 mt-1">{errors.packageName}</p>
                )}
                <p className="text-xs text-gray-500">
                  Must use lowercase letters, numbers, dots, and hyphens only. This is a unique identifier and cannot be changed later.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">
                  Display Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g., My Awesome App"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && (
                  <p className="text-xs text-red-500 mt-1">{errors.name}</p>
                )}
                <p className="text-xs text-gray-500">
                  The name that will be displayed to users in the AugmentOS app store.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="description"
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  placeholder="Describe what your app does..."
                  rows={3}
                  className={errors.description ? "border-red-500" : ""}
                />
                {errors.description && (
                  <p className="text-xs text-red-500 mt-1">{errors.description}</p>
                )}
                <p className="text-xs text-gray-500">
                  Provide a clear, concise description of your application's functionality.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="publicUrl">
                  Server URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="publicUrl"
                  name="publicUrl"
                  value={formData.publicUrl}
                  onChange={handleChange}
                  placeholder="https://yourserver.com"
                  className={errors.publicUrl ? "border-red-500" : ""}
                />
                {errors.publicUrl && (
                  <p className="text-xs text-red-500 mt-1">{errors.publicUrl}</p>
                )}
                <p className="text-xs text-gray-500">
                  The base URL of your server where AugmentOS will communicate with your app.
                  We'll automatically append "/webhook" to handle events when your app is activated.
                  Do not include a trailing slash - it will be automatically removed.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="logoURL">
                  Logo URL <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="logoURL"
                  name="logoURL"
                  value={formData.logoURL}
                  onChange={handleChange}
                  placeholder="https://yourserver.com/logo.png"
                  className={errors.logoURL ? "border-red-500" : ""}
                />
                {errors.logoURL && (
                  <p className="text-xs text-red-500 mt-1">{errors.logoURL}</p>
                )}
                <p className="text-xs text-gray-500">
                  URL to an image that will be used as your app's icon (recommended: 512x512 PNG).
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="webviewURL">Webview URL (Optional)</Label>
                <Input
                  id="webviewURL"
                  name="webviewURL"
                  value={formData.webviewURL || ''}
                  onChange={handleChange}
                  placeholder="https://yourserver.com/webview"
                  className={errors.webviewURL ? "border-red-500" : ""}
                />
                {errors.webviewURL && (
                  <p className="text-xs text-red-500 mt-1">{errors.webviewURL}</p>
                )}
                <p className="text-xs text-gray-500 pb-5">
                  If your app has a companion mobile interface, provide the URL here.
                </p>
              </div>

            </CardContent>
            <CardFooter className="flex justify-between border-t p-6">
              <Button variant="outline" type="button" onClick={() => navigate('/tpas')}>
                Back
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Creating..." : "Create App"}
              </Button>
            </CardFooter>
          </form>

          {successMessage && (
              <div className="m-4 mb-0">
                <Alert className="bg-green-100 border-1 border-green-500 text-green-800 shadow-md">
                  <CheckCircle className="h-5 w-5 text-green-800" />
                  <div>
                    <AlertDescription className="text-green-800 font-medium">{successMessage}</AlertDescription>
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsApiKeyDialogOpen(true)}
                        className="border-green-500 text-green-700 hover:bg-green-50"
                      >
                        View API Key
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate('/tpas')}
                        className="border-green-500 text-green-700 hover:bg-green-50"
                      >
                        Go to My Apps
                      </Button>
                    </div>
                  </div>
                </Alert>
              </div>
            )}
        </Card>


      </div>

      {/* API Key Dialog after successful creation */}
      {createdTPA && (
        <>
          <TpaSuccessDialog
            tpa={createdTPA}
            apiKey={apiKey}
            open={isSuccessDialogOpen}
            onOpenChange={handleSuccessDialogClose}
            onViewApiKey={handleViewApiKey}
          />

          <ApiKeyDialog
            tpa={createdTPA}
            apiKey={apiKey}
            open={isApiKeyDialogOpen}
            onOpenChange={handleApiKeyDialogClose}
            onKeyRegenerated={(newKey) => {
              setApiKey(newKey);
              console.log(`API key regenerated for ${createdTPA?.name}`);
            }}
          />
        </>
      )}
    </DashboardLayout>
  );
};

export default CreateTPA;