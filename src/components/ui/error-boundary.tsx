"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * Reusable error boundary component for catching errors in client components.
 * 
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 * 
 * @example With custom fallback
 * ```tsx
 * <ErrorBoundary fallback={<div>Something went wrong</div>}>
 *   <MyComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
        this.props.onError?.(error, errorInfo);
    }

    handleRetry = (): void => {
        this.setState({ hasError: false, error: null });
    };

    render(): ReactNode {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <Card className="m-4 rounded-3xl border-destructive/20 bg-destructive/5">
                    <CardHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-semibold text-foreground">
                                    Error al cargar el componente
                                </CardTitle>
                                <CardDescription className="text-muted-foreground">
                                    Ha ocurrido un error. Intenta recargar.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {process.env.NODE_ENV === "development" && this.state.error && (
                            <div className="mb-4 rounded-2xl bg-muted/50 p-3">
                                <p className="font-mono text-xs text-foreground">
                                    {this.state.error.message}
                                </p>
                            </div>
                        )}
                        <Button onClick={this.handleRetry} variant="outline" className="rounded-2xl">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Reintentar
                        </Button>
                    </CardContent>
                </Card>
            );
        }

        return this.props.children;
    }
}

/**
 * Higher-order component to wrap a component with error boundary.
 */
export function withErrorBoundary<P extends object>(
    WrappedComponent: React.ComponentType<P>,
    fallback?: ReactNode
): React.FC<P> {
    const WithErrorBoundary: React.FC<P> = (props) => (
        <ErrorBoundary fallback={fallback}>
            <WrappedComponent {...props} />
        </ErrorBoundary>
    );

    WithErrorBoundary.displayName = `WithErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || "Component"})`;

    return WithErrorBoundary;
}
