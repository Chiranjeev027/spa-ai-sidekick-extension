(function () {

   try {     
        // Intercept XMLHttpRequest
        console.log('Inject.js: Generalized interceptors loaded successfully!');

        const originalOpen = XMLHttpRequest.prototype.open;
        const originalSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this._interceptedUrl = url; // Save the request URL
            this._interceptedMethod = method; // Save the request method
            console.log('Intercepted XHR request:', { method, url });

            return originalOpen.apply(this, [method, url, ...rest]);
        };

        XMLHttpRequest.prototype.send = function (body) {
            this.addEventListener('load', () => { 
                console.log('Intercepted XHR response:', {
                    method: this._interceptedMethod,
                    url: this._interceptedUrl,
                    response: this.responseText,
                });

                // Dispatch a custom event with the response data
                const event = new CustomEvent('InterceptedRequest', {
                    detail: {
                        method: 'xhr',
                        url: this._interceptedUrl,
                        response: this.responseText,
                    },
                });
                window.dispatchEvent(event);
            });  

            // Handle errors (network failure or abort)
            this.addEventListener('error', () => {
            console.error('❌ XHR failed:', this._interceptedUrl);
            });

            this.addEventListener('abort', () => {
            console.warn('⚠️ XHR aborted:', this._interceptedUrl);
            });

            return originalSend.apply(this, [body]);
        };
    } catch (e) {
        console.error('Interceptor error:', e);
    }

})();
